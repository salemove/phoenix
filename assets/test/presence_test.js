import assert from "assert"

import {Presence} from "../js/phoenix"

let clone = (obj) => { return JSON.parse(JSON.stringify(obj)) }

let fixtures = {
  joins(){
    return {u1: {metas: [{id: 1, phx_ref: "1.2"}]}}
  },
  leaves(){
    return {u2: {metas: [{id: 2, phx_ref: "2"}]}}
  },
  state(){
    return {
      u1: {metas: [{id: 1, phx_ref: "1"}]},
      u2: {metas: [{id: 2, phx_ref: "2"}]},
      u3: {metas: [{id: 3, phx_ref: "3"}]}
    }
  }
}

let channelStub = {
  ref: 1,
  events: {},

  on(event, callback){ this.events[event] = callback },

  trigger(event, data){ this.events[event](data) },

  joinRef(){ return `${this.ref}` },

  simulateDisconnectAndReconnect(){
    this.ref++
  }
}

let listByFirst = (id, {metas: [first, ...rest]}) => first

describe("syncState", () => {
  it("syncs empty state", () => {
    let newState = {u1: {metas: [{id: 1, phx_ref: "1"}]}}
    let state = {}
    Presence.syncState(state, newState)
    assert.deepEqual(state, newState)
  })

  it("invokes onChange on joins and leaves", () => {
    let newState = fixtures.state()
    let state = {u4: {metas: [{id: 4, phx_ref: "4"}]}}
    let changes = {}

    let onChange = (key, oldPresence, newPresence) => {
      changes[key] = {oldPresence: oldPresence, newPresence: newPresence}
    }

    Presence.syncState(state, newState, onChange)
    assert.deepEqual(state, newState)

    assert.deepEqual(changes, {
      u1: {oldPresence: null, newPresence: {metas: [{id: 1, phx_ref: "1"}]}},
      u2: {oldPresence: null, newPresence: {metas: [{id: 2, phx_ref: "2"}]}},
      u3: {oldPresence: null, newPresence: {metas: [{id: 3, phx_ref: "3"}]}},
      u4: {oldPresence: {metas: [{id: 4, phx_ref: "4"}]}, newPresence: {metas: []}}
    })
  })

  it.only('has metas for presences after state sync due to server restart', () => {
    // State prior to server disconnect, id: 1 is joined to presence
    let state = {
      u1: {metas: [{id: 1, phx_ref: "1"}]}
    };

    // New state from new server instance with id: 1 still joined, but with new phx_ref
    let newState = {
      u1: {metas: [{id: 1, phx_ref: "2"}]}
    };

    let changes = {}
    let onChange = (key, oldPresence, newPresence) => {
      changes[key] = {oldPresence: oldPresence, newPresence: newPresence}
    }

    Presence.syncState(state, newState, onChange);

    assert.deepEqual(state, {
      u1: {metas: [{id: 1, phx_ref: "2"}]}
    });

    assert.deepEqual(changes, {
      u1: {
        oldPresence: {metas: [{id: 1, phx_ref: "1"}]},
        newPresence: {metas: [{id: 1, phx_ref: "2"}]}
      }
    });
  });
})

describe("syncDiff", () => {
  it("syncs empty state", () => {
    let joins = {u1: {metas: [{id: 1, phx_ref: "1"}]}}
    let state = {}

    const returnedState = Presence.syncDiff(state, {joins: joins, leaves: {}})
    assert.deepEqual(state, joins)
    assert.deepEqual(state, returnedState)
  })

  it("removes presence when meta is empty and adds additional meta", () => {
    let state = fixtures.state()
    Presence.syncDiff(state, {joins: fixtures.joins(), leaves: fixtures.leaves()})

    assert.deepEqual(state, {
      u1: {metas: [{id: 1, phx_ref: "1"}, {id: 1, phx_ref: "1.2"}]},
      u3: {metas: [{id: 3, phx_ref: "3"}]}
    })
  })

  it("removes meta while leaving key if other metas exist", () => {
    let state = {
      u1: {metas: [{id: 1, phx_ref: "1"}, {id: 1, phx_ref: "1.2"}]}
    }
    Presence.syncDiff(state, {joins: {}, leaves: {u1: {metas: [{id: 1, phx_ref: "1"}]}}})

    assert.deepEqual(state, {
      u1: {metas: [{id: 1, phx_ref: "1.2"}]},
    })
  })

  it("calls onChange function on update", done => {
    let state = {}
    let update1 = {
      joins: {u1: {metas: [{id: 1, phx_ref: 1}, {id: 2, phx_ref: 2}]}},
      leaves: {}
    }
    let update2 = {
      joins: {u1: {metas: [{id: 1, phx_ref_prev: 1, phx_ref: 1.1}]}},
      leaves: {u1: {metas: [{id: 1, phx_ref: 1}]}}
    }

    let stateAfterUpdate1 = {metas: [{id: 1, phx_ref: 1}, {id: 2, phx_ref: 2}]}
    let expectedFinalState = {metas: [{id: 2, phx_ref: 2}, {id: 1, phx_ref: 1.1, phx_ref_prev: 1}]}

    let onChange = (key, oldPresence, newPresence) => {
      assert.deepEqual(key, "u1");
      assert.deepEqual(oldPresence, stateAfterUpdate1)
      assert.deepEqual(newPresence, expectedFinalState)
      done();
    };

    Presence.syncDiff(state, update1)
    Presence.syncDiff(state, update2, onChange)
  });

  it("calls onChange function on leave", done => {
    let state = {}
    let update1 = {
      joins: {u1: {metas: [{id: 1, phx_ref: 1}, {id: 2, phx_ref: 2}]}},
      leaves: {}
    }
    let update2 = {
      joins: {},
      leaves: {u1: {metas: [{id: 1, phx_ref: 1}]}}
    }

    let stateAfterUpdate1 = {metas: [{id: 1, phx_ref: 1}, {id: 2, phx_ref: 2}]}
    let expectedFinalState = {metas: [{id: 2, phx_ref: 2}]}

    let onChange = (key, oldPresence, newPresence) => {
      assert.deepEqual(key, "u1");
      assert.deepEqual(oldPresence, stateAfterUpdate1)
      assert.deepEqual(newPresence, expectedFinalState)
      done();
    };

    Presence.syncDiff(state, update1)
    Presence.syncDiff(state, update2, onChange)
  });

  it("calls onChange with latest custom state", done => {
    let state = {}
    let update1 = {
      joins: {u1: {foo: 'bar', metas: [{id: 1, phx_ref: 1}]}},
      leaves: {}
    }
    let update2 = {
      joins: {u1: {foo: 'baz', metas: [{id: 1, phx_ref_prev: 1, phx_ref: 1.1}]}},
      leaves: {u1: {foo: 'bar', metas: [{id: 1, phx_ref: 1}]}}
    }

    let stateAfterUpdate1 = {foo: 'bar', metas: [{id: 1, phx_ref: 1}]}
    let expectedFinalState = {foo: 'baz', metas: [{id: 1, phx_ref: 1.1, phx_ref_prev: 1}]}

    let onChange = (key, oldPresence, newPresence) => {
      assert.deepEqual(key, "u1");
      assert.deepEqual(oldPresence, stateAfterUpdate1)
      assert.deepEqual(newPresence, expectedFinalState)
      done();
    };

    Presence.syncDiff(state, update1)
    Presence.syncDiff(state, update2, onChange)
  });
})

describe("list", () => {
  it("lists full presence by default", () => {
    let state = fixtures.state()
    assert.deepEqual(Presence.list(state), [
      {metas: [{id: 1, phx_ref: "1"}]},
      {metas: [{id: 2, phx_ref: "2"}]},
      {metas: [{id: 3, phx_ref: "3"}]}
    ])
  })

  it("lists with custom function", () => {
    let state = {u1: {metas: [
      {id: 1, phx_ref: "1.first"},
      {id: 1, phx_ref: "1.second"}]
    }}

    let listBy = (key, {metas: [first, ...rest]}) => {
      return first
    }

    assert.deepEqual(Presence.list(state, listBy), [
      {id: 1, phx_ref: "1.first"}
    ])
  })
})

describe("instance", () => {
  it("syncs state and diffs", () => {
    let presence = new Presence(channelStub)
    let user1 = {metas: [{id: 1, phx_ref: "1"}]}
    let user2 = {metas: [{id: 2, phx_ref: "2"}]}
    let newState = {u1: user1, u2: user2}

    channelStub.trigger("presence_state", newState)
    assert.deepEqual(presence.list(listByFirst), [{id: 1, phx_ref: 1},
                                                  {id: 2, phx_ref: 2}])

    channelStub.trigger("presence_diff", {joins: {}, leaves: {u1: user1}})
    assert.deepEqual(presence.list(listByFirst), [{id: 2, phx_ref: 2}])
  })


  it("applies pending diff if state is not yet synced", () => {
    let presence = new Presence(channelStub)
    let onChanges = []

    presence.onChange((id, oldPresence, newPresence) => {
      onChanges.push({id, oldPresence, newPresence})
    })

    // new connection
    let user1 = {metas: [{id: 1, phx_ref: "1"}]}
    let user2 = {metas: [{id: 2, phx_ref: "2"}]}
    let user3 = {metas: [{id: 3, phx_ref: "3"}]}
    let newState = {u1: user1, u2: user2}
    let leaves = {u2: user2}

    channelStub.trigger("presence_diff", {joins: {}, leaves: leaves})

    assert.deepEqual(presence.list(listByFirst), [])
    assert.deepEqual(presence.pendingDiffs, [{joins: {}, leaves: leaves}])

    channelStub.trigger("presence_state", newState)
    assert.deepEqual(onChanges, [
      {id: "u1", oldPresence: undefined, newPresence: user1},
      {id: "u2", oldPresence: undefined, newPresence: user2},
      {id: "u2", oldPresence: user2, newPresence: {metas: []}}
    ])

    assert.deepEqual(presence.list(listByFirst), [{id: 1, phx_ref: "1"}])
    assert.deepEqual(presence.pendingDiffs, [])

    // disconnect and reconnect
    assert.equal(presence.inPendingSyncState(), false)
    channelStub.simulateDisconnectAndReconnect()
    assert.equal(presence.inPendingSyncState(), true)

    channelStub.trigger("presence_diff", {joins: {}, leaves: {u1: user1}})
    assert.deepEqual(presence.list(listByFirst), [{id: 1, phx_ref: "1"}])

    channelStub.trigger("presence_state", {u1: user1, u3: user3})
    assert.deepEqual(presence.list(listByFirst), [{id: 3, phx_ref: "3"}])
  })

  it("allows custom channel events", () => {
    let presence = new Presence(channelStub, {events: {
      state: "the_state",
      diff: "the_diff"
    }})

    let user1 = {metas: [{id: 1, phx_ref: "1"}]}
    channelStub.trigger("the_state", {user1: user1})
    assert.deepEqual(presence.list(listByFirst), [{id: 1, phx_ref: "1"}])
    channelStub.trigger("the_diff", {joins: {}, leaves: {user1: user1}})
    assert.deepEqual(presence.list(listByFirst), [])
  })
})
