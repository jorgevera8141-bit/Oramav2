const { SocialProvider } = require('./base');

class InstagramProvider extends SocialProvider {
  constructor() {
    super('instagram');
  }

  async publish(post) {
    return {
      status: 'READY_FOR_PUBLICATION',
      provider: 'instagram',
      note: 'Sin credenciales de Instagram Graph API configuradas — la publicación queda lista para publicarse manualmente.',
      preview: {
        caption: [post.titular, post.caption, post.cta, post.hashtags].filter(Boolean).join('\n\n'),
        imagen_url: post.imagen_url || null
      }
    };
  }
}

module.exports = { InstagramProvider };
