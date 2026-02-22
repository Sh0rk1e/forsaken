export function byId(id) {
  return document.getElementById(id);
}

export function addListener(id, eventName, handler, options) {
  const element = byId(id);
  if (!element) {
    console.warn(`Missing DOM element: #${id}`);
    return null;
  }
  element.addEventListener(eventName, handler, options);
  return element;
}

export function addListenerToElement(element, eventName, handler, options) {
  if (!element) return false;
  element.addEventListener(eventName, handler, options);
  return true;
}
