<template>
  <nav
    v-if="$vuetify.display.smAndDown"
    aria-label="Library navigation"
    class="mobile-navigation"
  >
    <div
      v-if="crumbs.length === 1"
      class="library-home"
      aria-current="page"
    >
      <v-icon size="20">
        home
      </v-icon><span>Library home</span>
    </div>
    <template v-else>
      <v-btn
        :to="crumbs[crumbs.length - 2].to"
        variant="text"
        height="44"
        prepend-icon="chevron_left"
        class="library-back"
        :aria-label="`Back to ${crumbs[crumbs.length - 2].title}`"
      >
        {{ crumbs[crumbs.length - 2].title }}
      </v-btn>
      <span
        class="current-location"
        aria-current="page"
        :title="crumbs[crumbs.length - 1].title"
      >
        {{ crumbs[crumbs.length - 1].title }}
      </span>
    </template>
  </nav>
  <v-breadcrumbs
    v-else
    :items="displayCrumbs"
    class="text-left breadcrumbs-truncate"
  >
    <template #divider>
      <v-icon>chevron_right</v-icon>
    </template>

    <template #item="props">
      <v-breadcrumbs-item
        :to="props.item.to"
        :exact="true"
        class="breadcrumb-item"
      >
        {{ props.item.title }}
      </v-breadcrumbs-item>
    </template>
  </v-breadcrumbs>
</template>

<script>
import { mapGetters } from 'vuex';
import linkWithRoom from '@/mixins/linkwithroom';
import contentLink from '@/mixins/contentlink';

export default {
  name: 'TheAppBarCrumbs',

  mixins: [
    contentLink,
    linkWithRoom,
  ],

  computed: {
    ...mapGetters([
      'GET_ACTIVE_METADATA',
    ]),

    ...mapGetters('plexservers', [
      'GET_PLEX_SERVER',
    ]),

    crumbs() {
      const data = [
        {
          title: 'Home',
          to: this.linkWithRoom({ name: 'PlexHome' }),
        },
      ];

      if (this.GET_ACTIVE_METADATA) {
        if (this.GET_ACTIVE_METADATA.query) {
          data.push({
            title: `Search: ${this.GET_ACTIVE_METADATA.query}`,
            to: this.linkWithRoom({
              name: 'PlexSearch',
              params: {
                query: this.GET_ACTIVE_METADATA.query,
              },
            }),
          });
        }

        if (this.GET_ACTIVE_METADATA.machineIdentifier) {
          data.push({
            title: this.GET_PLEX_SERVER(this.GET_ACTIVE_METADATA.machineIdentifier)?.name || 'Library',
            to: this.linkWithRoom({
              name: 'PlexServer',
              params: {
                machineIdentifier: this.GET_ACTIVE_METADATA.machineIdentifier,
              },
            }),
          });

          if (this.GET_ACTIVE_METADATA.librarySectionID != null) {
            data.push({
              title: this.GET_ACTIVE_METADATA.librarySectionTitle,
              to: this.linkWithRoom({
                name: 'PlexLibrary',
                params: {
                  machineIdentifier: this.GET_ACTIVE_METADATA.machineIdentifier,
                  sectionId: this.GET_ACTIVE_METADATA.librarySectionID,
                },
              }),
            });
          }

          if (this.GET_ACTIVE_METADATA.grandparentRatingKey != null) {
          // TODO: figure out how to tell lol
            data.push({
              title: this.GET_ACTIVE_METADATA.grandparentTitle,
              to: this.linkWithRoom({
                name: 'PlexMedia',
                params: {
                  machineIdentifier: this.GET_ACTIVE_METADATA.machineIdentifier,
                  ratingKey: this.GET_ACTIVE_METADATA.grandparentRatingKey,
                },
              }),
            });
          }

          if (this.GET_ACTIVE_METADATA.parentRatingKey != null) {
            data.push({
              title: this.GET_ACTIVE_METADATA.parentTitle,
              to: this.linkWithRoom({
                name: 'PlexMedia',
                params: {
                  machineIdentifier: this.GET_ACTIVE_METADATA.machineIdentifier,
                  ratingKey: this.GET_ACTIVE_METADATA.parentRatingKey,
                },
              }),
            });
          }

          if (this.GET_ACTIVE_METADATA.ratingKey != null) {
            data.push({
              title: this.GET_ACTIVE_METADATA.title,
              to: this.contentLink(this.GET_ACTIVE_METADATA),
            });
          }
        }
      }

      return data;
    },

    displayCrumbs() {
      return this.crumbs;
    },
  },
};
</script>

<style scoped>
.mobile-navigation {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  min-width: 0;
}
.library-home {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: #d5d8df;
}
.library-back { max-width: 48%; min-width: 44px; text-transform: none; letter-spacing: 0; padding-inline: 4px 8px; }
.library-back :deep(.v-btn__content) { display: block; overflow: hidden; text-overflow: ellipsis; }
.current-location {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 600;
}

.breadcrumbs-truncate {
  flex: 1 1 0;
  min-width: 0;
  flex-wrap: wrap;
  padding-top: 0;
  padding-bottom: 0;
  padding-left: 8px;
}

.breadcrumb-item {
  white-space: nowrap;
}
</style>
