import { createHash } from "node:crypto";
import { readState, writeState } from "./access.ts";
import { reconcile, type Board } from "./board.ts";

// Server-only: never export these from a "use server" file, where a caller could pass someone else's email.
const path = (email: string) => `_system/board/${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32)}.json`;
export const loadBoard = async (email: string, matterIds: string[]) => reconcile(await readState<Board | null>(path(email), null), matterIds);
export const storeBoard = (email: string, b: Board) => writeState(path(email), b);
