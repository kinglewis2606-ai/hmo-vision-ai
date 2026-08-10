// CJS shim for uuid in Jest environment
let counter = 0;
function v4() {
  return `test-uuid-${Date.now()}-${++counter}`;
}
module.exports = { v4 };
module.exports.v4 = v4;
