package bd.info.bsdc.app.feature.market;

import java.util.Locale;

/**
 * Pure Java 21 Play-Store-compliant marketplace pricing, shipping estimation,
 * and digital-goods policy guard.
 */
public final class MarketBillingPolicyEngine {

    private MarketBillingPolicyEngine() {}

    /**
     * Formats a money amount. Every BDT amount the backend sends is in poisha
     * (1 taka = 100 poisha), so BDT is always shown as taka: 450 poisha is
     * "BDT 4.50" and 12000 poisha is "৳120". Other currencies are shown as
     * their own minor-unit-free integer, unchanged.
     */
    public static String formatCurrency(long amount, String currency, boolean bn) {
        String curr = (currency == null || currency.isBlank())
            ? "BDT"
            : currency.trim().toUpperCase(Locale.ROOT);
        if ("BDT".equals(curr)) {
            long sign = amount < 0 ? -1L : 1L;
            long absolute = Math.abs(amount);
            long taka = absolute / 100L;
            long paisa = absolute % 100L;
            String grouped = String.format(Locale.US, "%,d", taka);
            String body = paisa == 0L
                ? grouped
                : grouped + String.format(Locale.US, ".%02d", paisa);
            String signed = (sign < 0 ? "-" : "") + body;
            return (bn ? "৳" : "BDT ") + signed;
        }
        return curr + " " + amount;
    }

    /**
     * Estimates shipping per shop using exact Postgres rules (free over threshold, else flat).
     * Final order amount is always calculated authoritatively by Postgres `place_order()`.
     */
    public static long estimateShipping(long subtotal, long flatFee, Long freeShippingOver) {
        if (subtotal <= 0L) return 0L;
        if (freeShippingOver != null && freeShippingOver > 0L && subtotal >= freeShippingOver) {
            return 0L;
        }
        return Math.max(0L, flatFee);
    }

    /**
     * Ensures Play Store compliance by allowing direct native Cash-on-Delivery physical
     * order placement while keeping digital product fulfillment web/Play-Billing separate.
     */
    public static boolean canOrderPhysicallyInApp(boolean isDigitalProduct) {
        return !isDigitalProduct;
    }

    public static String orderStatusLabel(String rawStatus, boolean bn) {
        String st = rawStatus == null ? "" : rawStatus.trim().toLowerCase(Locale.ROOT);
        switch (st) {
            case "placed":
                return bn ? "অর্ডার গৃহীত" : "Placed";
            case "confirmed":
                return bn ? "নিশ্চিতকৃত" : "Confirmed";
            case "packed":
                return bn ? "প্যাক করা হয়েছে" : "Packed";
            case "shipped":
                return bn ? "ডেলিভারির পথে" : "Shipped";
            case "delivered":
                return bn ? "ডেলিভারি সম্পন্ন" : "Delivered";
            case "cancelled":
                return bn ? "বাতিল" : "Cancelled";
            default:
                return st.isEmpty() ? (bn ? "অজানা" : "Unknown") : st.toUpperCase(Locale.ROOT);
        }
    }

    public static String formatRating(int ratingSum, int ratingCount) {
        if (ratingCount <= 0) return "0.0";
        double avg = (double) ratingSum / ratingCount;
        return String.format(Locale.US, "%.1f", avg);
    }
}
