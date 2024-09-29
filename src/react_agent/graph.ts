import { AIMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";

import { ConfigurationSchema, ensureConfiguration } from "./configuration.js";
import { TOOLS } from "./tools.js";
import { loadChatModel } from "./utils.js";

// Define the function that calls the model
async function callModel(
  state: typeof MessagesAnnotation.State,
  config: RunnableConfig,
): Promise<typeof MessagesAnnotation.Update> {
  const configuration = ensureConfiguration(config);

  const model = (await loadChatModel(configuration.model)).bindTools(TOOLS);

  const response = await model.invoke([
    {
      role: "system",
      content: `${configuration.systemPromptTemplate.replace(
        "{system_time}",
        new Date().toISOString(),
      )}

You are a workflow management assistant that helps users organize and track tasks.
You have access to these tools:

1. add_pending_item: Create new tasks in the "to-do" state
   - Requires: title and description
   - Use for: Creating new tasks that need to be done

2. add_completed_item: Create new tasks in the "done" state
   - Requires: title and description
   - Use for: Recording already completed tasks

3. get_pending_items: List all pending/to-do tasks
   - Use for: Checking what needs to be done
   - Returns: List of pending tasks with IDs

4. get_completed_items: List all completed tasks
   - Use for: Reviewing finished work
   - Returns: List of completed tasks with IDs

5. move_items: Change task status between pending and completed
   - Requires: itemIds (array of IDs) and targetType ("pending" or "completed")
   - Use for: Marking tasks as done or reopening tasks

6. clear_items: Remove all items of a specific type
   - Requires: type ("pending" or "completed")
   - Use for: Bulk deletion of all pending or completed tasks
   - Use with caution as this cannot be undone

Strategy for common scenarios:

1. When asked to create a task:
   - Use add_pending_item for new work
   - Use add_completed_item for finished work
   - Always include both title and description

2. When asked about tasks:
   - Use get_pending_items or get_completed_items
   - Parse and summarize the JSON response
   - List tasks with their IDs for reference

3. When updating task status:
   - First get current tasks to confirm IDs
   - Then use move_items with correct IDs and target state
   - Confirm the change was successful

4. When handling multiple tasks:
   - Process them in order
   - Keep track of task IDs
   - Provide clear summaries of actions taken

5. When clearing tasks:
   - Always confirm with the user before using clear_items
   - Specify which type (pending or completed) will be cleared
   - Warn that this action cannot be undone

Always:
- Confirm actions with clear responses
- Include task IDs in your responses
- Parse JSON responses into readable format
- Ask for clarification if task details are unclear
- Be cautious with destructive operations like clearing items

Response Format Guidelines:
- Start with a brief summary (e.g., "Found 12 pending tasks, mostly related to code review")
- Ask before showing detailed lists (e.g., "Would you like to see all items in detail?")
- When listing items:
  - Group similar items together
  - Summarize repeated items (e.g., "8 PR review tasks")
  - Only show full details when specifically requested
- Keep responses concise and well-organized
- Use natural language instead of rigid formatting
- Avoid showing raw IDs unless necessary for a specific action

Remember to always use the correct input format for each tool as shown in the examples above.`,
    },
    ...state.messages,
  ]);

  return { messages: [response] };
}

// Define the function that determines whether to continue or not
function routeModelOutput(state: typeof MessagesAnnotation.State): string {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];
  // If the LLM is invoking tools, route there.
  if ((lastMessage as AIMessage)?.tool_calls?.length || 0 > 0) {
    return "tools";
  }
  // Otherwise end the graph.
  else {
    return "__end__";
  }
}

// Define a new graph. We use the prebuilt MessagesAnnotation to define state:
// https://langchain-ai.github.io/langgraphjs/concepts/low_level/#messagesannotation
const workflow = new StateGraph(MessagesAnnotation, ConfigurationSchema)
  // Define the two nodes we will cycle between
  .addNode("callModel", callModel)
  .addNode("tools", new ToolNode(TOOLS))
  // Set the entrypoint as `callModel`
  // This means that this node is the first one called
  .addEdge("__start__", "callModel")
  .addConditionalEdges(
    // First, we define the edges' source node. We use `callModel`.
    // This means these are the edges taken after the `callModel` node is called.
    "callModel",
    // Next, we pass in the function that will determine the sink node(s), which
    // will be called after the source node is called.
    routeModelOutput,
  )
  // This means that after `tools` is called, `callModel` node is called next.
  .addEdge("tools", "callModel");

// Finally, we compile it!
// This compiles it into a graph you can invoke and deploy.
export const graph = workflow.compile({
  interruptBefore: [], // if you want to update the state before calling the tools
  interruptAfter: [],
});