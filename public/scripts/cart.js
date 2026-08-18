const CART_KEY = "rhpp-seed-cart-v1";

function readCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent("rhpp:cart-change", { detail: cart }));
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function lineKey(item) {
  return `${item.collection}:${item.productId}:${item.isolated ? "isolated" : "standard"}`;
}

function renderCart() {
  const cart = readCart();
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll("[data-cart-count]").forEach((node) => { node.textContent = String(count); });

  const itemsNode = document.querySelector("[data-cart-items]");
  const emptyNode = document.querySelector("[data-cart-empty]");
  const summaryNode = document.querySelector("[data-cart-summary]");
  if (!(itemsNode instanceof HTMLElement) || !(emptyNode instanceof HTMLElement) || !(summaryNode instanceof HTMLElement)) return;

  itemsNode.replaceChildren();
  emptyNode.hidden = cart.length > 0;
  summaryNode.hidden = cart.length === 0;

  for (const item of cart) {
    const line = document.createElement("div");
    line.className = "cart-line";
    line.dataset.key = lineKey(item);
    line.innerHTML = `
      <div><p class="cart-line-name"></p><p class="cart-line-meta"></p></div>
      <strong class="cart-line-price"></strong>
      <div class="cart-line-controls">
        <button type="button" data-cart-decrease aria-label="Decrease quantity">−</button>
        <span></span>
        <button type="button" data-cart-increase aria-label="Increase quantity">+</button>
        <button class="cart-remove" type="button" data-cart-remove>Remove</button>
      </div>`;
    line.querySelector(".cart-line-name").textContent = item.name;
    line.querySelector(".cart-line-meta").textContent = item.isolated ? "Isolated seed packet" : "Standard seed packet";
    line.querySelector(".cart-line-price").textContent = money(item.unitPrice * item.quantity);
    line.querySelector(".cart-line-controls span").textContent = String(item.quantity);
    itemsNode.append(line);
  }

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const subtotalNode = document.querySelector("[data-cart-subtotal]");
  if (subtotalNode) subtotalNode.textContent = money(subtotal);
}

function openCart() {
  const drawer = document.querySelector("[data-cart-drawer]");
  const backdrop = document.querySelector("[data-cart-backdrop]");
  if (!(drawer instanceof HTMLElement) || !(backdrop instanceof HTMLElement)) return;
  backdrop.hidden = false;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeCart() {
  const drawer = document.querySelector("[data-cart-drawer]");
  const backdrop = document.querySelector("[data-cart-backdrop]");
  if (!(drawer instanceof HTMLElement) || !(backdrop instanceof HTMLElement)) return;
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  document.body.style.overflow = "";
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("[data-cart-open]")) return openCart();
  if (target.closest("[data-cart-close], [data-cart-backdrop]")) return closeCart();

  const addButton = target.closest(".add-to-cart-button");
  if (addButton instanceof HTMLElement) {
    const card = addButton.closest(".seed-card");
    const isolated = Boolean(card?.querySelector(".isolated-checkbox:checked"));
    const basePrice = Number(addButton.dataset.price);
    const isolatedPrice = isolated ? Number(addButton.dataset.isolatedPrice || 0) : 0;
    const next = {
      productId: addButton.dataset.productId,
      collection: addButton.dataset.collection,
      name: addButton.dataset.name,
      productUrl: addButton.dataset.productUrl,
      isolated,
      unitPrice: basePrice + isolatedPrice,
      quantity: 1,
    };
    const cart = readCart();
    const existing = cart.find((item) => lineKey(item) === lineKey(next));
    if (existing) existing.quantity = Math.min(existing.quantity + 1, 20);
    else cart.push(next);
    writeCart(cart);
    addButton.textContent = "Added to cart";
    setTimeout(() => { addButton.textContent = "Add to cart"; }, 1200);
    openCart();
    return;
  }

  const line = target.closest(".cart-line");
  if (!(line instanceof HTMLElement) || !line.dataset.key) return;
  const cart = readCart();
  const index = cart.findIndex((item) => lineKey(item) === line.dataset.key);
  if (index < 0) return;
  if (target.closest("[data-cart-increase]")) cart[index].quantity = Math.min(cart[index].quantity + 1, 20);
  if (target.closest("[data-cart-decrease]")) cart[index].quantity = Math.max(cart[index].quantity - 1, 1);
  if (target.closest("[data-cart-remove]")) cart.splice(index, 1);
  writeCart(cart);
});

window.addEventListener("rhpp:cart-change", renderCart);
window.addEventListener("storage", renderCart);
window.RHPP_CART = { read: readCart, write: writeCart, key: CART_KEY, money };
renderCart();
