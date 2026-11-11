package bd.info.bsdc.app.core.common;

import static org.junit.Assert.assertEquals;

import bd.info.bsdc.app.core.model.AppLanguage;
import org.junit.Test;

public class BanglaDigitFormatterTest {

    @Test
    public void convertsDigitsToBanglaLocale() {
        assertEquals("১২,৩৪৫", BanglaDigitFormatter.toBanglaDigits("12,345"));
        assertEquals("২০২৬", BanglaDigitFormatter.formatCount(2026, AppLanguage.BN));
        assertEquals("2026", BanglaDigitFormatter.formatCount(2026, AppLanguage.EN));
    }
}
