/**
 * This file defines the tools available to the ReAct agent.
 * Tools are functions that the agent can use to interact with external systems or perform specific tasks.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";

const API_BASE_URL = "http://localhost:3000/api/workflows";

const itemSchema = z.object({
  title: z.string().describe("Title of the workflow item"),
  description: z.string().describe("Description of the workflow item"),
});

const moveItemsSchema = z.object({
  itemIds: z.array(z.string()).describe("Array of item IDs to move"),
  targetType: z.enum(["pending", "completed"]).describe("Where to move the items"),
});

export const addPendingItem = tool(
  async (input) => {
    const response = await axios.post(`${API_BASE_URL}/pending`, input);
    return JSON.stringify(response.data);
  },
  {
    name: "add_pending_item",
    description: "Add a new pending workflow item",
    schema: itemSchema,
  }
);

export const addCompletedItem = tool(
  async (input) => {
    const response = await axios.post(`${API_BASE_URL}/completed`, input);
    return JSON.stringify(response.data);
  },
  {
    name: "add_completed_item",
    description: "Add a new completed workflow item",
    schema: itemSchema,
  }
);

export const getPendingItems = tool(
  async () => {
    const response = await axios.get(`${API_BASE_URL}/pending`);
    return JSON.stringify(response.data);
  },
  {
    name: "get_pending_items",
    description: "Get all pending workflow items",
    schema: z.object({}),
  }
);

export const getCompletedItems = tool(
  async () => {
    const response = await axios.get(`${API_BASE_URL}/completed`);
    return JSON.stringify(response.data);
  },
  {
    name: "get_completed_items",
    description: "Get all completed workflow items",
    schema: z.object({}),
  }
);

export const moveItems = tool(
  async (input) => {
    const { itemIds, targetType } = input;
    const sourceType = targetType === "completed" ? "pending" : "completed";
    const response = await axios.patch(`${API_BASE_URL}/${sourceType}`, {
      itemIds,
      targetType
    });
    return JSON.stringify(response.data);
  },
  {
    name: "move_items",
    description: "Move items between pending and completed states",
    schema: moveItemsSchema,
  }
);

export const clearItems = tool(
  async (input) => {
    const { type } = input;
    const response = await axios.delete(`${API_BASE_URL}/${type}`);
    return JSON.stringify(response.data);
  },
  {
    name: "clear_items",
    description: "Clear all items of a specific type (pending or completed)",
    schema: z.object({
      type: z.enum(["pending", "completed"]).describe("Type of items to clear"),
    }),
  }
);

export const TOOLS = [
  addPendingItem,
  addCompletedItem,
  getPendingItems,
  getCompletedItems,
  moveItems,
  clearItems,
];