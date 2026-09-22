// Stand-in for MagicMirror's "node_helper": hand the definition back as-is so
// the test can call its methods directly.
module.exports = {
  create(definition) {
    return definition;
  },
};
