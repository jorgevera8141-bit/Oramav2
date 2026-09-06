// Seam for a real Instagram/Facebook Graph API integration later. No credentials
// exist today, so concrete providers never return PUBLISHED — the strongest state
// they report is READY_FOR_PUBLICATION (queued for a human to post manually).
class SocialProvider {
  constructor(name) {
    this.name = name;
  }

  // eslint-disable-next-line no-unused-vars
  async publish(post) {
    throw new Error(`El proveedor ${this.name} no implementa publish().`);
  }
}

module.exports = { SocialProvider };
