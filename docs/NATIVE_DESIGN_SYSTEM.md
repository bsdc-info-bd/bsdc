# BSDC native design system

BSDC uses an original Compose/Material 3 visual system. It is deliberately a native community product interface rather than a reproduction of another service's branding or layout.

## Light theme

The default light mode pairs a white reading surface with a very light neutral-green canvas. BSDC forest green is reserved for primary actions and identity; accessible blue is used as a secondary navigation and attribution accent. Cards use low-contrast outlines instead of heavy shadows, so long developer discussions remain easy to scan.

Dark mode uses deep green-neutral surfaces with high-contrast mint and blue accents. Both schemes expose Material semantic roles rather than hard-coding colors in feature screens.

## Tokens

`ui/theme/Theme.kt` owns:

- semantic Material color schemes for light and dark modes;
- type scale with readable line heights and strong developer-content hierarchy;
- shapes from compact controls through large adaptive cards;
- system-theme support via the existing DataStore theme preference.

Feature screens should use `MaterialTheme.colorScheme`, `typography`, and `shapes`, not raw color literals.

## Responsive rules

- Feed content is centered and capped at 760dp on wide displays, avoiding unreadably long text lines on tablets, foldables, desktop-mode devices, and Chromebooks.
- Phones retain edge-to-edge content with 16dp gutters and Material touch targets.
- The root shell uses bottom navigation on compact displays and a navigation rail at 840dp and above.
- Image posts are cropped inside bounded containers to reduce memory pressure and avoid layout jumps.

## Interaction rules

Every exposed action is functional. The feed offers compose, reactions, comment navigation, organization/series navigation where routes are available, and a native Android share sheet. Unsupported actions are not shown as inert icons. Loading uses static placeholders rather than continuous decorative animation.

The temporary BSDC monogram is an original Compose drawing. An approved optimized vector logo can replace it without changing feature layouts.
