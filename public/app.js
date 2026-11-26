// Resume site behaviour: scroll reveal and the recruiter chat panel.
// Progressive enhancement only: every section is readable without this file.
//
// Security notes:
// - Text from the visitor and from the server is only ever assigned with
//   textContent, so it is never parsed as markup or run as code.
// - The only network call is a same-origin POST to /api/chat (the CSP's
//   connect-src 'self' would block anything else anyway).
// - The conversation lives in memory only: no localStorage, sessionStorage
//   or cookies, so nothing persists after the tab closes.

const root = document.documentElement;
root.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- Scroll reveal ---------- */

function setupReveal() {
  if (reducedMotion.matches || !("IntersectionObserver" in window)) return;

  const targets = [...document.querySelectorAll("[data-reveal]")];
  // Anything already on screen stays visible, so nothing flashes on load.
  for (const el of targets) {
    if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-visible");
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0 },
  );
  for (const el of targets) {
    if (!el.classList.contains("is-visible")) observer.observe(el);
  }

  // The CSS hides unrevealed sections only while this class is present.
  root.classList.add("reveal");
}

/* ---------- Chat ---------- */

// Mirrors the server's limits in api/chat.js so valid requests aren't rejected.
const MAX_CHARS = 1000;
const MAX_MESSAGES = 20;
const MAX_BODY_BYTES = 16384;
const MAX_EVENT_BUFFER = 65536;

const TEXT = {
  refusal: "I can't help with that one. Try asking about Bryant's experience or skills.",
  rateLimited: "You're sending messages quickly. Please wait a minute and try again.",
  unavailable: "The assistant is unavailable right now. Please try again later.",
  rejected: "That message couldn't be sent. Please try again.",
};

const encoder = new TextEncoder();

// Cut to max UTF-16 units without leaving half a surrogate pair at the end.
function clip(text, max) {
  if (text.length <= max) return text;
  let out = text.slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out;
}

function messageForStatus(status) {
  if (status === 429) return TEXT.rateLimited;
  if ([400, 403, 413, 415].includes(status)) return TEXT.rejected;
  return TEXT.unavailable; // 503, other 5xx and anything unexpected
}

// Parses one SSE block. Each "data:" line (with or without one following
// space) must be JSON; anything malformed is skipped rather than trusted.
function parseEvents(block) {
  const events = [];
  for (const line of block.split("\n")) {
    if (!line.startsWith("data:")) continue;
    let payload = line.slice(5);
    if (payload.startsWith(" ")) payload = payload.slice(1);
    try {
      const event = JSON.parse(payload);
      if (event && typeof event === "object" && typeof event.type === "string") events.push(event);
    } catch {
      // Ignore a malformed event.
    }
  }
  return events;
}

function setupChat() {
  const panel = document.getElementById("chat-panel");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const sendButton = document.getElementById("chat-send");
  const closeButton = document.getElementById("chat-close");
  const log = document.getElementById("chat-log");
  const scroller = document.getElementById("chat-body");
  const errorBox = document.getElementById("chat-error");
  if (!panel || !form || !input || !sendButton || !closeButton || !log || !scroller || !errorBox) return;

  const triggers = [...document.querySelectorAll("[data-chat-open]")];
  const starters = [...panel.querySelectorAll("[data-starter]")];

  // Below 768px the panel is a full-screen sheet, so the page behind it is
  // made inert while it's open. From 768px it's a non-modal side panel.
  const sheetQuery = window.matchMedia("(max-width: 767.98px)");
  const fab = document.querySelector(".chat-fab");
  const background = [
    document.querySelector(".skip-link"),
    document.querySelector(".site-header"),
    document.querySelector("main"),
    document.querySelector(".site-footer"),
    fab && !panel.contains(fab) ? fab : null,
  ].filter(Boolean);

  // Completed exchanges only, always [user, assistant, user, assistant, ...].
  const conversation = [];
  let controller = null; // AbortController for the in-flight request
  let lastTrigger = null;

  /* Panel open/close (a non-modal panel: focus is not trapped) */

  function setExpanded(expanded) {
    for (const t of triggers) t.setAttribute("aria-expanded", String(expanded));
  }

  function updateInert() {
    const inert = !panel.hidden && sheetQuery.matches;
    for (const el of background) el.inert = inert;
  }
  sheetQuery.addEventListener("change", updateInert);

  function openPanel(trigger) {
    lastTrigger = trigger;
    panel.hidden = false;
    root.classList.add("chat-open");
    setExpanded(true);
    updateInert();
    input.focus();
  }

  function closePanel() {
    // Only move focus back if it was in the panel; if the visitor has tabbed
    // elsewhere, leave it where it is.
    const focusWasInside = panel.contains(document.activeElement);
    abortStream();
    panel.hidden = true;
    root.classList.remove("chat-open");
    setExpanded(false);
    updateInert(); // before refocusing: an inert trigger can't take focus
    const returnTo = lastTrigger ?? triggers.at(-1);
    lastTrigger = null;
    if (focusWasInside && returnTo) returnTo.focus();
  }

  for (const trigger of triggers) {
    trigger.addEventListener("click", () => (panel.hidden ? openPanel(trigger) : closePanel()));
  }
  closeButton.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.isComposing && !panel.hidden) closePanel();
  });

  /* Rendering (textContent only) */

  // Runs a DOM update and follows it to the end only if the visitor was
  // already at (or within 40px of) the bottom, so reading back isn't interrupted.
  // `force` always scrolls to the end (used for the visitor's own message).
  function updateLog(change, force = false) {
    const atEnd = force || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 40;
    change();
    if (atEnd) scroller.scrollTop = scroller.scrollHeight;
  }

  function appendMessage(role, text) {
    const item = document.createElement("div");
    item.className = `msg msg-${role}`;
    const who = document.createElement("span");
    who.className = "visually-hidden";
    who.textContent = role === "user" ? "You said: " : "Assistant: ";
    const body = document.createElement("div");
    body.className = "msg-text";
    body.textContent = text;
    item.append(who, body);
    // The visitor's own just-sent message is always scrolled into view.
    updateLog(() => log.append(item), role === "user");
    return { item, body };
  }

  // An assistant bubble that starts with a typing indicator.
  function createReply() {
    const { item, body } = appendMessage("assistant", "");
    const typing = document.createElement("span");
    typing.className = "typing";
    typing.setAttribute("aria-hidden", "true");
    typing.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
    updateLog(() => item.append(typing));
    return {
      setText(text) {
        updateLog(() => {
          typing.remove();
          body.textContent = text;
        });
      },
      setNote(text) {
        updateLog(() => {
          typing.remove();
          item.classList.add("msg-note");
          body.textContent = text;
        });
      },
      // Keeps the partial text and marks the reply as cut off.
      markStopped() {
        const note = document.createElement("div");
        note.className = "msg-stopped";
        note.textContent = "(stopped)";
        updateLog(() => {
          typing.remove();
          item.append(note);
        });
      },
      finish(keep) {
        typing.remove();
        if (!keep) item.remove();
      },
    };
  }

  function showError(message) {
    errorBox.textContent = message;
  }

  function clearError() {
    errorBox.textContent = "";
  }

  function setStreaming(streaming) {
    sendButton.disabled = streaming;
    for (const b of starters) b.disabled = streaming;
    log.setAttribute("aria-busy", streaming ? "true" : "false");
  }

  function abortStream() {
    if (!controller) return;
    controller.abort();
    controller = null;
    setStreaming(false);
  }

  /* Request building */

  // The API accepts at most 20 messages, starting with "user" and alternating,
  // with each message 1-1000 chars and the body at most 16 KB.
  function buildRequestMessages(text) {
    let messages = [...conversation, { role: "user", content: text }].slice(-MAX_MESSAGES);
    while (messages.length && messages[0].role !== "user") messages.shift();
    // Drop the oldest exchange until the body fits. Removing a user/assistant
    // pair from the front keeps the list starting with "user".
    while (messages.length > 1 && encoder.encode(JSON.stringify({ messages })).length > MAX_BODY_BYTES) {
      messages = messages.slice(2);
    }
    return messages;
  }

  /* Sending and streaming */

  async function send(text) {
    abortStream(); // sending again cancels any in-flight reply
    clearError();

    const messages = buildRequestMessages(text);
    const ctrl = new AbortController();
    controller = ctrl;
    // Mark the log busy before adding to it, so the live region waits for the reply.
    setStreaming(true);
    appendMessage("user", text);
    const reply = createReply();

    let replyText = "";
    let failure = "";
    let refused = false;
    let finished = false;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: ctrl.signal,
      });

      if (response.status !== 200 || !response.body) {
        // The error body is never shown; only a fixed message per status.
        failure = messageForStatus(response.status);
        response.body?.cancel().catch(() => {});
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        read: while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          // Normalise CRLF and CR line endings to LF. A CRLF split across two
          // chunks can only add an empty line between data lines, and each
          // line is parsed on its own, so that's harmless.
          buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n?/g, "\n");

          // Events can be split across chunks, so only complete blocks are parsed.
          let boundary;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            for (const event of parseEvents(block)) {
              if (event.type === "text" && typeof event.text === "string") {
                replyText += event.text;
                reply.setText(replyText);
              } else if (event.type === "refusal") {
                refused = true;
              } else if (event.type === "error") {
                // Always the fixed client message; the server's text is never shown.
                failure = TEXT.unavailable;
              } else if (event.type === "done") {
                finished = true;
                break read;
              }
            }
          }

          if (buffer.length > MAX_EVENT_BUFFER) {
            failure = TEXT.unavailable; // no event boundary in a long stream: give up
            break;
          }
        }
        reader.cancel().catch(() => {});
        if (!finished && !failure) failure = TEXT.unavailable; // stream ended early
      }
    } catch {
      // An abort (panel closed or a newer send) is not an error to show.
      if (!ctrl.signal.aborted) failure = TEXT.unavailable;
    }

    const aborted = ctrl.signal.aborted;
    if (refused) {
      reply.setNote(TEXT.refusal);
      reply.finish(true);
    } else {
      // A reply cut off by a close, a newer send or an error keeps its text.
      if (replyText.length > 0 && (aborted || failure)) reply.markStopped();
      reply.finish(replyText.length > 0);
    }
    if (failure && !aborted) showError(failure);

    // Only a complete reply with text joins the history. Assistant text is
    // clipped to the API's per-message limit for the next request.
    const content = clip(replyText.trim(), MAX_CHARS).trim();
    if (finished && !failure && !refused && content) {
      conversation.push({ role: "user", content: text }, { role: "assistant", content });
    }

    // A newer send or a close may already own the shared state.
    if (controller === ctrl) {
      controller = null;
      setStreaming(false);
    }
  }

  function submitText(raw) {
    const text = clip(raw.trim(), MAX_CHARS).trim();
    if (!text) return false; // refuse empty or whitespace-only input
    send(text);
    return true;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    // While a reply is streaming, Enter does nothing, like the disabled Send button.
    if (controller) return;
    // Keep focus in the input: the Send button is disabled while streaming.
    input.focus();
    if (submitText(input.value)) input.value = "";
  });

  // Enter sends, Shift+Enter adds a new line. IME-safe: Enter that confirms a
  // composition (isComposing / keyCode 229) is left alone, default included.
  input.addEventListener("keydown", (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (!e.repeat) form.requestSubmit();
  });

  for (const starter of starters) {
    starter.addEventListener("click", () => {
      input.focus(); // the starter is about to be disabled
      submitText(starter.textContent ?? "");
    });
  }
}

setupReveal();
setupChat();
