const { SocialProvider } = require('./base');

class FacebookProvider extends SocialProvider {
  constructor() {
    super('facebook');
  }

  async publish(post) {
    return {
      status: 'READY_FOR_PUBLICATION',
      provider: 'facebook',
      note: 'Sin credenciales de Facebook Graph API configuradas — la publicación queda lista para publicarse manualmente.',
      preview: {
        caption: [post.titular, post.caption, post.cta, post.hashtags].filter(Boolean).join('\n\n'),
        imagen_url: post.imagen_url || null
      }
    };
  }
}

module.exports = { FacebookProvider };
