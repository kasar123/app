// Holds HTML for the in-app PDF preview screen (avoids passing large strings as route params).
let current: { html: string; title: string } = { html: "", title: "" };
export const setPreview = (html: string, title: string) => { current = { html, title }; };
export const getPreview = () => current;
