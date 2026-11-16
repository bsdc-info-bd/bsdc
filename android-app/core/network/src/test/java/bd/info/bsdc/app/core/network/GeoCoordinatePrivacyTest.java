package bd.info.bsdc.app.core.network;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class GeoCoordinatePrivacyTest {

    @Test
    public void roundsDhakaCoordinatesToTwoDecimals() {
        assertEquals(23.81, GeoCoordinatePrivacy.roundTwoDecimals(23.810332), 0.0001);
        assertEquals(90.41, GeoCoordinatePrivacy.roundTwoDecimals(90.412518), 0.0001);
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsInvalidLatitude() {
        GeoCoordinatePrivacy.validateCoordinates(95.0, 90.0);
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsNaNCoordinate() {
        GeoCoordinatePrivacy.validateCoordinates(Double.NaN, 90.0);
    }
}
