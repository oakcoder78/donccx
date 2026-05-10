# Module — Donkie

### Purpose
Donkie is an in‑app conversational assistant focused on Customer Success (CS) for the Donc platform.
- Appears as a floating circular button (`DonkieButton`) in the lower‑right corner of every screen.
- When clicked, it slides a side panel (`DonkiePanel`) onto the viewport.
- Provides a chat‑style interface where users can ask questions about customers, CS strategies, or request help drafting communications.
- Solves the need for quick, context‑aware CS support without leaving the application.
- Available on any page that includes the global `DonkieButton` component (e.g., dashboards, client pages, activity screens).

### Responsibilities
- **DonkieButton** – renders the fixed action button, toggles the panel open/close, and (future) shows unread‑message badge.
- **DonkiePanel** – renders the full chat UI, handles message rendering, image attachment, mode switching (discussion ↔ implementation), supervised actions (e.g., creating activities), and conversation lifecycle (clear, send, loading).
- Integrates with the `useDonkie` hook for state management and with `useActivityMutations` to create supervised activities.
- Provides markdown rendering, action parsing (`[ACAO:{…}]`), and a simple loading indicator.

### Module Structure
- **DonkieButton.jsx** – button that opens/closes Donkie, displays “D” or an X icon, and (placeholder) badge for unread messages.
- **DonkiePanel.jsx** – full side‑panel implementation, including:
  - UI sections (header, messages list, footer/input).
  - Helpers: `renderMarkdown`, `parseMessageParts`, `ActionCard`, `MessageBubble`, `TypingIndicator`.
  - State hooks for input, image attachment, action confirmations, and auto‑scroll.

### UI Architecture
1. **Button** is fixed‑position, styled with a dark background and a “D” label when closed, an X icon when open.
2. **Panel** slides in from the right when `isOpen` is true, overlaying a semi‑transparent background on mobile.
3. Header shows Donkie avatar, name, mode toggle button, clear‑conversation button, and close button.
4. Message list displays user bubbles (blue) and assistant bubbles (light) with optional markdown, images, and action cards.
5. Footer contains image‑attach button, textarea (auto‑resizing), and send button.
6. Interaction flow: click button → panel opens → type or attach image → send → assistant replies (may include actionable cards) → user confirms/cancels actions.

### Data Flow
- **Incoming**: `useDonkie` supplies `messages`, `isLoading`, `mode`, and control functions (`toggle`, `close`, `sendMessage`, etc.).
- **User input**: Text + optional base64 image are sent via `sendMessage`.
- **Assistant messages**: Rendered through `MessageBubble`, which parses `[ACAO:{…}]` blocks.
- **Supervised actions**: `ActionCard` receives an `action` object; on confirm, `handleConfirmAction` calls `createActivity.mutateAsync` and then posts a confirmation message.
- **State**: `actionStates` tracks confirmed/cancelled status per action; component re‑renders accordingly.

### Dependencies
- **Hooks**: `useDonkie` (state & API), `useActivityMutations` (activity creation).
- **Libraries**: `react`, `react-hot-toast` (error toast).
- **Components**: internal UI built with inline style objects; no external UI library imports.

### AI Provider

#### Overview
In May 2026, Donkie migrated from direct Anthropic Claude API to OpenRouter with automatic fallback between free models.

#### Architecture Change

| Component | Before | After |
|-----------|--------|-------|
| Edge Function | `donkie-chat` (direct Anthropic) | `openrouter-proxy` (OpenRouter) |
| Model | `claude-sonnet-4-20250514` (paid) | 3x free models with fallback |
| max_tokens | 1000 | 1000 (maintained) |

#### Configuration

| Resource | Table | Key | Used By |
|----------|-------|-----|---------|
| Models | `freshdesk_config` | `ai_models` | `openrouter-proxy` |
| System Prompt | `donkie_config` | `system_prompt` | `useDonkie.jsx` |

#### Known Limitations

- **Higher latency** – free models are inherently slower than paid alternatives
- **Quality variance** – responses may vary more than the previous Claude implementation

#### Files Modified

- `supabase/functions/openrouter-proxy/index.ts`
- `src/hooks/useDonkie.jsx`

### Integration Points
- Any page that imports `DonkieButton` (typically at the app root) gets the assistant.
- `useDonkie` likely communicates with backend AI services (not shown) to obtain assistant messages.
- `useActivityMutations` connects to Supabase activity endpoints for creating CS activities from assistant‑suggested actions.

### Main User Flows
1. **Open Donkie** – click floating button → panel slides in.
2. **Chat** – type query (or attach image) → press Enter / Send → message sent, loading indicator shows, response appears.
3. **Switch Mode** – toggle between “💬 Discussão” and “⚡ Implement.” to change assistant behavior.
4. **Supervised Action** – assistant suggests an activity (e.g., create meeting) → user clicks *Confirmar* → activity created via Supabase, confirmation message posted.
5. **Clear Conversation** – click trash icon to reset message history.
6. **Close** – click overlay or X button to hide panel.

### State Management
- `useDonkie` (external hook) holds global open/close state, message array, loading flag, mode, and API calls.
- Local component state: `input`, `image`, `actionStates`.
- `isOpen` controls both button title and panel visibility; `toggle` flips it.
- `actionStates` maps a generated key (`msgId_partIndex`) to `true|false` for each action card.

### Known Risks
- **External service coupling** – relies on `useDonkie`'s backend; failures will break the chat UI.
- **Action parsing** – uses a simple regex; malformed `[ACAO:...]` blocks could cause parsing errors.
- **Inline styling** – changes to design system require updating many style objects manually.
- **Image handling** – loads whole image as base64 in memory; large files could impact performance.
- **Unread badge placeholder** – currently static (`unread = 0`); future implementation may need state sync.
- **AI provider latency** – OpenRouter free models may introduce noticeable delays.
- **Quality variance** – response quality may vary between fallback models.

### Future Improvements
- Extract repeated inline styles into reusable Tailwind CSS classes or a design‑system component library.
- Implement real unread‑message tracking and display in the badge.
- Add unit / integration tests for `renderMarkdown`, `parseMessageParts`, and action handling.
- Lazy‑load the panel bundle to reduce initial JS payload.
- Improve accessibility (ARIA labels, keyboard navigation).
- Add error handling UI for failed AI responses or activity creation.

### File Reference Map
- `src/components/donkie/DonkieButton.jsx`
- `src/components/donkie/DonkiePanel.jsx`
