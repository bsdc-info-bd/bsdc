package bd.info.bsdc.app.core

import bd.info.bsdc.app.auth.AuthRepository
import bd.info.bsdc.app.data.CommunityRepository
import bd.info.bsdc.app.data.LegalConsentRepository
import bd.info.bsdc.app.data.OrganizationRepository
import bd.info.bsdc.app.data.ProfileRepository
import bd.info.bsdc.app.media.CloudinaryMediaUploader
import bd.info.bsdc.app.messaging.ChatRepository
import bd.info.bsdc.app.notifications.NotificationRepository

/** Single application graph; dependencies remain explicit and testable without a DI framework. */
data class AppContainer(
    val settings: SettingsRepository,
    val auth: AuthRepository,
    val legalConsents: LegalConsentRepository,
    val community: CommunityRepository,
    val organizations: OrganizationRepository,
    val profiles: ProfileRepository,
    val chat: ChatRepository,
    val notifications: NotificationRepository,
    val media: CloudinaryMediaUploader
)
