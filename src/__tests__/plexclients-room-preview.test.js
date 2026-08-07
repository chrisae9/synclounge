import { describe, expect, it } from 'vitest';
import getters from '@/store/modules/plexclients/getters';

describe('active media room preview', () => {
  it('builds a bounded server-only preview from active metadata', () => {
    let imageOptions;
    const metadata = {
      title: 'Test Movie',
      year: 2026,
      summary: 'Summary',
      type: 'movie',
      thumb: '/library/metadata/1/thumb',
      machineIdentifier: 'machine',
      ratingKey: '1',
    };
    const preview = getters.GET_ACTIVE_MEDIA_ROOM_PREVIEW(
      {},
      { GET_ACTIVE_MEDIA_METADATA: metadata },
      {},
      {
        'plexservers/GET_MEDIA_IMAGE_URL': (options) => {
          imageOptions = options;
          return `https://plex.example${options.mediaUrl}`
            + `?width=${options.width}&height=${options.height}`;
        },
      },
    );

    expect(preview).toEqual({
      title: 'Test Movie',
      year: 2026,
      summary: 'Summary',
      type: 'movie',
      posterUrl: 'https://plex.example/library/metadata/1/thumb?width=600&height=900',
      machineIdentifier: 'machine',
      ratingKey: '1',
      grandparentTitle: undefined,
      parentIndex: undefined,
      index: undefined,
    });
    expect(imageOptions).toMatchObject({ width: 600, height: 900 });
  });

  it('returns null when no media is active', () => {
    expect(getters.GET_ACTIVE_MEDIA_ROOM_PREVIEW(
      {},
      { GET_ACTIVE_MEDIA_METADATA: null },
      {},
      {},
    )).toBeNull();
  });

  it('omits a poster URL when image URL construction fails', () => {
    const preview = getters.GET_ACTIVE_MEDIA_ROOM_PREVIEW(
      {},
      {
        GET_ACTIVE_MEDIA_METADATA: {
          title: 'Test Movie',
          machineIdentifier: 'machine',
          ratingKey: '1',
        },
      },
      {},
      {
        'plexservers/GET_MEDIA_IMAGE_URL': () => { throw new Error('missing server'); },
      },
    );

    expect(preview.posterUrl).toBeUndefined();
  });

  it('omits over-limit optional metadata while preserving schema boundaries', () => {
    const boundary = 'x'.repeat(500);
    const preview = getters.GET_ACTIVE_MEDIA_ROOM_PREVIEW(
      {},
      {
        GET_ACTIVE_MEDIA_METADATA: {
          title: boundary,
          summary: `${boundary}x`,
          type: 42,
          grandparentTitle: boundary,
          year: -1,
          parentIndex: 1_000_000_000_000,
          index: '999999999999',
          machineIdentifier: 'machine',
          ratingKey: '1',
        },
      },
      {},
      { 'plexservers/GET_MEDIA_IMAGE_URL': () => undefined },
    );

    expect(preview).toMatchObject({
      title: boundary,
      summary: undefined,
      type: undefined,
      grandparentTitle: boundary,
      year: undefined,
      parentIndex: undefined,
      index: '999999999999',
    });
  });

  it('omits the entire preview when required identifiers cannot satisfy the schema', () => {
    const metadata = {
      title: 'Test Movie',
      machineIdentifier: 'm'.repeat(501),
      ratingKey: '1',
    };
    const imageGetter = () => 'https://plex.example/poster.jpg';
    expect(getters.GET_ACTIVE_MEDIA_ROOM_PREVIEW(
      {},
      { GET_ACTIVE_MEDIA_METADATA: metadata },
      {},
      { 'plexservers/GET_MEDIA_IMAGE_URL': imageGetter },
    )).toBeNull();

    metadata.machineIdentifier = '\uD800';
    expect(getters.GET_ACTIVE_MEDIA_ROOM_PREVIEW(
      {},
      { GET_ACTIVE_MEDIA_METADATA: metadata },
      {},
      { 'plexservers/GET_MEDIA_IMAGE_URL': imageGetter },
    )).toBeNull();
  });

  it('omits an invalid optional poster URL without discarding the preview', () => {
    const preview = getters.GET_ACTIVE_MEDIA_ROOM_PREVIEW(
      {},
      {
        GET_ACTIVE_MEDIA_METADATA: {
          title: 'Test Movie',
          machineIdentifier: 'machine',
          ratingKey: '1',
        },
      },
      {},
      { 'plexservers/GET_MEDIA_IMAGE_URL': () => `https://${'x'.repeat(2048)}` },
    );

    expect(preview.title).toBe('Test Movie');
    expect(preview.posterUrl).toBeUndefined();
  });
});
