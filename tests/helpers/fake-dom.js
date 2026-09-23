/**
 * Just enough DOM for lib/task-renderer.js and lib/long-press.js: elements with
 * classList, dataset, style, children, textContent, events and a class-based
 * querySelector.
 */
class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toLowerCase();
    this.children = [];
    this.parent = null;
    this.className = "";
    this.dataset = {};
    this.listeners = {};
    this.ownText = "";
    this.offsetWidth = 0;
    const styles = {};
    this.style = new Proxy(styles, {
      get: (target, key) =>
        key === "setProperty"
          ? (name, value) => {
              target[name] = value;
            }
          : (target[key] ?? ""),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    });
  }

  get classList() {
    const read = () => this.className.split(/\s+/).filter(Boolean);
    const write = (list) => {
      this.className = list.join(" ");
    };
    return {
      contains: (name) => read().includes(name),
      add: (...names) => write([...new Set([...read(), ...names])]),
      remove: (...names) => write(read().filter((c) => !names.includes(c))),
      toggle: (name, force) => {
        const has = read().includes(name);
        const next = force === undefined ? !has : force;
        if (next && !has) write([...read(), name]);
        if (!next && has) write(read().filter((c) => c !== name));
        return next;
      },
    };
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  get textContent() {
    return this.ownText + this.children.map((c) => c.textContent).join("");
  }

  set textContent(value) {
    this.children = [];
    this.ownText = String(value);
  }

  addEventListener(type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }

  dispatch(type) {
    for (const handler of this.listeners[type] || []) {
      handler({ type });
    }
  }

  findAll(predicate) {
    const found = [];
    for (const child of this.children) {
      if (predicate(child)) found.push(child);
      found.push(...child.findAll(predicate));
    }
    return found;
  }

  byClass(name) {
    return this.findAll((el) => el.classList.contains(name));
  }

  querySelector(selector) {
    return this.byClass(selector.replace(/^\./, ""))[0] || null;
  }
}

function installFakeDocument() {
  const original = globalThis.document;
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
  };
  return () => {
    globalThis.document = original;
  };
}

module.exports = { FakeElement, installFakeDocument };
