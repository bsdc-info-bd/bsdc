pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "bsdc-android"

include(":app")
include(":core:model")
include(":core:common")
include(":core:designsystem")
include(":core:permissions")
include(":core:network")
include(":core:auth")
include(":core:media")
include(":core:database")
include(":core:sync")
include(":feature:onboarding")
include(":feature:feed")
include(":feature:compose")
include(":feature:messenger")
