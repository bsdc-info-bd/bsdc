#!/bin/sh
# BSDC's lightweight Gradle bootstrap. It keeps the repository free of binary wrapper jars
# while using the pinned Gradle version from gradle-wrapper.properties.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
VERSION=$(sed -n 's#.*gradle-\([0-9.]*\)-bin.zip.*#\1#p' "$ROOT/gradle/wrapper/gradle-wrapper.properties")
CACHE_DIR="${GRADLE_USER_HOME:-$HOME/.gradle}/bsdc-distributions"
GRADLE_HOME="$CACHE_DIR/gradle-$VERSION"
if [ ! -x "$GRADLE_HOME/bin/gradle" ]; then
  mkdir -p "$CACHE_DIR"
  ARCHIVE="$CACHE_DIR/gradle-$VERSION-bin.zip"
  if [ ! -f "$ARCHIVE" ]; then
    echo "Downloading pinned Gradle $VERSION..." >&2
    curl --fail --location --retry 3 "https://services.gradle.org/distributions/gradle-$VERSION-bin.zip" -o "$ARCHIVE"
  fi
  unzip -q -o "$ARCHIVE" -d "$CACHE_DIR"
fi
exec "$GRADLE_HOME/bin/gradle" --no-daemon "$@"
