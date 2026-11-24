import { api } from "@/lib/api";

type PaymentOrder = Awaited<ReturnType<typeof api.createPaymentOrder>>;
type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

let checkoutScript: Promise<void> | undefined;

function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScript) return checkoutScript;
  checkoutScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay checkout could not be loaded. Check your internet connection and try again."));
    document.head.append(script);
  });
  return checkoutScript;
}

export async function openRazorpayCheckout(order: PaymentOrder, onComplete: () => void, onDismiss: () => void) {
  if (!order.keyId) throw new Error("Razorpay is not configured for this platform yet.");
  if (new Date(order.expiresAt).getTime() <= Date.now()) throw new Error("This payment session has expired. Select the slot again to start a new checkout.");
  await loadCheckoutScript();
  if (!window.Razorpay) throw new Error("Razorpay checkout is unavailable.");
  const checkout = new window.Razorpay({
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    name: order.name,
    description: order.description,
    order_id: order.orderId,
    handler: async (response: RazorpayResponse) => {
      try {
        await api.verifyPayment({ paymentId: order.paymentId, ...response });
        onComplete();
      } catch (cause) {
        onDismiss();
        throw cause;
      }
    },
    modal: { ondismiss: onDismiss },
    theme: { color: "#182314" },
  });
  checkout.open();
}
