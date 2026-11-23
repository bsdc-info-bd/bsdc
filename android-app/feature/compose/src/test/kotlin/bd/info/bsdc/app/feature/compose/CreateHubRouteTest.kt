package bd.info.bsdc.app.feature.compose

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Which creation screen a link opens.
 *
 * The website has answered `/create?kind=job` with the job form for a long time; the app answered
 * every `/create` with the event form, so a link that worked in a browser opened the wrong screen
 * here. These are the web's rules, written down once and checked against its own default.
 */
class CreateHubRouteTest {
    @Test
    fun eachKindOpensItsOwnScreen() {
        assertEquals(CreateHubMode.EVENT, CreateHubMode.fromRoute("/create?kind=event"))
        assertEquals(CreateHubMode.JOB, CreateHubMode.fromRoute("/create?kind=job"))
        assertEquals(CreateHubMode.GIG, CreateHubMode.fromRoute("/create?kind=gig"))
        assertEquals(CreateHubMode.PROJECT, CreateHubMode.fromRoute("/create?kind=project"))
        assertEquals(CreateHubMode.GROUP, CreateHubMode.fromRoute("/create?kind=group"))
    }

    @Test
    fun anUnknownKindIsTheWebsDefaultNotAnError() {
        // `isKind(requested) ? requested : 'event'` in CreatePage.tsx. A member following an old link
        // deserves the page the site would have shown, not a blank form or a crash.
        assertEquals(CreateHubMode.EVENT, CreateHubMode.fromRoute("/create"))
        assertEquals(CreateHubMode.EVENT, CreateHubMode.fromRoute("/create?kind="))
        assertEquals(CreateHubMode.EVENT, CreateHubMode.fromRoute("/create?kind=poetry"))
        assertEquals(CreateHubMode.EVENT, CreateHubMode.fromRoute(null))
        // The app has a sixth kind the site does not, and a link cannot ask for it.
        assertEquals(CreateHubMode.EVENT, CreateHubMode.fromRoute("/create?kind=post"))
    }

    @Test
    fun theQueryIsReadTolerantly() {
        // Deep links arrive from outside the app: uppercase, padding, other parameters, fragments.
        assertEquals(CreateHubMode.GROUP, CreateHubMode.fromRoute("/create?kind=GROUP"))
        assertEquals(CreateHubMode.JOB, CreateHubMode.fromRoute("/create?kind= job "))
        assertEquals(CreateHubMode.PROJECT, CreateHubMode.fromRoute("/create?x=1&kind=project&y=2"))
        assertEquals(CreateHubMode.GIG, CreateHubMode.fromRoute("/create?kind=gig#form"))
        assertEquals(CreateHubMode.EVENT, CreateHubMode.fromRoute("/create?type=job"))
    }
}
