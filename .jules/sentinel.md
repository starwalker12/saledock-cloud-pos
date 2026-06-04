## 2024-05-28 - Unescaped Env Variables in Next.js Script Tags
**Vulnerability:** String interpolation of environment variables within `dangerouslySetInnerHTML` for `<Script>` tags can lead to Cross-Site Scripting (XSS) if the variables are manipulated.
**Learning:** React escapes DOM attributes automatically but does not sanitize code within `dangerouslySetInnerHTML`. Interpolation directly into these blocks bypasses standard security measures.
**Prevention:** Always pass dynamic variables as `data-*` attributes to script tags and retrieve them via DOM API inside the script context instead of string interpolation.
