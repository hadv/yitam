# Agentic RAG Migration Walkthrough

## Summary of Changes
We have successfully transitioned the `Query` service from a single-turn tool execution flow to a multi-turn **Agentic RAG** loop.

### Key Refactors
1.  **Multi-Turn Logic**: Both `processQuery` and `processQueryWithStreaming` now use a `while` loop (max 5 steps) to allow the Agent to:
    -   Execute a tool.
    -   Observe the result.
    -   Decide to execute *another* tool (or the same one with different args) based on the previous result.
    -   Provide a final summary when satisfied.
2.  **Tool Availability**: The Agent now has access to tools in *every* step of the conversation loop, not just the first one.
3.  **Dynamic Limits**: Removed the hardcoded limit (`limit=6`) in `_handleToolUse`. The Agent can now specify the `limit` parameter in its tool calls to control the volume of data retrieved.
4.  **History Management**: Updated `Conversation.ts` with `addAssistantMessageContent` to correctly store rich message history (interleaved text and tool usage) for Anthropic's context window.
5.  **Loop Exhaustion Recovery**: If the Agent reaches the maximum number of steps (5) and ends on a tool result, the system now automatically triggers one final response generation (without tools) to ensure the user receives an answer.

## Verification

### How to Test
You can verify the new "Agentic" behavior with specific queries that require multi-step reasoning or iterative refinement.

#### 1. Multi-Step Retrieval
**Query**: "Search for 'Taoism' concepts, and then find specific information about 'Wu Wei' within those results."
-   **Expected Behavior**:
    1.  Agent calls search tool for "Taoism".
    2.  Agent sees results.
    3.  Agent calls search tool again for "Wu Wei" (or filters/refines based on first result).
    4.  Agent provides final answer combining both.

#### 2. Self-Correction / Refinement
**Query**: "Find documents about 'Quantum Physics' in the database." (Assuming this domain suggests 'Physics' or similar)
-   **Expected Behavior**:
    1.  Agent might search broadly.
    2.  If tools return "No results found" or poor relevance, the Agent should now *try again* with a different keyword or domain automatically, instead of just saying "I couldn't find anything."

#### 3. Agent-Controlled Limits
**Query**: "Find exactly 3 documents about 'Meditation'."
-   **Expected Behavior**:
    1.  Agent calls the search tool with `limit: 3` in the arguments (you can verify this in the server logs).

### Technical Verification
-   **Logs**: Check the server console logs. You should see entries like:
    -   `Step 1/5 - Messages count: ...`
    -   `Calling tool: ...`
    -   `Step 2/5 - Messages count: ...` (if multi-step)
