package bd.info.bsdc.app.core.network;

/**
 * Privacy-preserving coordinate rounding matching main-site/src/lib/geo/reverse.ts.
 *
 * <p>Coordinates are rounded to 2 decimal places (~1.1 km) on-device before leaving
 * the phone so street-level locations are never transmitted or persisted.
 */
public final class GeoCoordinatePrivacy {

    private static final double SCALE = 100.0;

    private GeoCoordinatePrivacy() {}

    public static double roundTwoDecimals(double value) {
        if (!Double.isFinite(value)) {
            throw new IllegalArgumentException("Coordinate must be finite");
        }
        return Math.round(value * SCALE) / SCALE;
    }

    public static void validateCoordinates(double latitude, double longitude) {
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude)) {
            throw new IllegalArgumentException("Coordinates must be finite");
        }
        if (Math.abs(latitude) > 90.0 || Math.abs(longitude) > 180.0) {
            throw new IllegalArgumentException("Coordinates out of bounds");
        }
    }
}
