/**
 * Initializes the Presence
 * @param {Channel} channel - The Channel
 * @param {Object} opts - The options,
 *        for example `{events: {state: "state", diff: "diff"}}`
 */
export default class Presence {

  constructor(channel, opts = {}){
    let events = opts.events || {state: "presence_state", diff: "presence_diff"}
    this.state = {}
    this.pendingDiffs = []
    this.channel = channel
    this.joinRef = null
    this.caller = {
      onChange: null,
      onJoin: null,
      onLeave: null,
      onSync: function (){ }
    }

    this.channel.on(events.state, newState => {
      let {onChange, onJoin, onLeave, onSync} = this.caller

      this.joinRef = this.channel.joinRef()
      if (onJoin || onLeave) {
        Presence.syncState(this.state, newState, onJoin, onLeave)
      } else {
        Presence.synchronizeState(this.state, newState, onChange)
      }

      this.pendingDiffs.forEach(diff => {
        if (onJoin || onLeave) {
          Presence.syncDiff(this.state, diff, onJoin, onLeave)
        } else {
          Presence.synchronizeDiff(this.state, diff, onChange)
        }
      })
      this.pendingDiffs = []
      onSync()
    })

    this.channel.on(events.diff, diff => {
      let {onChange, onJoin, onLeave, onSync} = this.caller

      if(this.inPendingSyncState()){
        this.pendingDiffs.push(diff)
      } else {
        if (onJoin || onLeave) {
          Presence.syncDiff(this.state, diff, onJoin, onLeave)
        } else {
          Presence.synchronizeDiff(this.state, diff, onChange)
        }
        onSync()
      }
    })
  }

  // @deprecated Please use onChange instead
  onJoin(callback){
    console && console.warn && console.warn('onJoin is deprecated, use onChange instead')
    this.caller.onJoin = callback
  }

  // @deprecated Please use onChange instead
  onLeave(callback){
    console && console.warn && console.warn('onLeave is deprecated, use onChange instead')
    this.caller.onLeave = callback
  }

  onChange(callback){ this.caller.onChange = callback }

  onSync(callback){ this.caller.onSync = callback }

  list(by){ return Presence.list(this.state, by) }

  inPendingSyncState(){
    return !this.joinRef || (this.joinRef !== this.channel.joinRef())
  }

  // lower-level public static API

  /**
   * Used to sync the list of presences on the server with the client's state.
   * An optional `onChange` callback can be provided to react to changes in the
   * client's local presences across disconnects and reconnects with the
   * server.
   *
   * onChange callback will be invoked with three arguments:
   * 1. key - presence key (e.g. user-5)
   * 2. oldPresence - presence object before the sync
   * 3. newPresence - presence object after the sync
   *
   * **NOTE**: This function mutates the state object that is passed to this
   * function as the first argument.
   *
   * @returns {Presence}
   */
   static synchronizeState(state, newState, onChange){
    let joins = {}
    let leaves = {}

    this.map(state, (key, presence) => {
      if(!newState[key]){
        leaves[key] = presence
      }
    })
    this.map(newState, (key, newPresence) => {
      let currentPresence = state[key]
      if(currentPresence){
        let newRefs = newPresence.metas.map(m => m.phx_ref)
        let curRefs = currentPresence.metas.map(m => m.phx_ref)
        let joinedMetas = newPresence.metas.filter(m => curRefs.indexOf(m.phx_ref) < 0)
        let leftMetas = currentPresence.metas.filter(m => newRefs.indexOf(m.phx_ref) < 0)
        if(joinedMetas.length > 0){
          joins[key] = newPresence
          joins[key].metas = joinedMetas
        }
        if(leftMetas.length > 0){
          if(joinedMetas.length > 0){
            leaves[key] = {metas: leftMetas}
          } else {
            leaves[key] = newPresence;
            leaves[key].metas = leftMetas
          }
        }
      } else {
        joins[key] = newPresence
      }
    })
    return this.synchronizeDiff(state, {joins: joins, leaves: leaves}, onChange)
  }

  /**
   * Used to sync the list of presences on the server
   * with the client's state. An optional `onJoin` and `onLeave` callback can
   * be provided to react to changes in the client's local presences across
   * disconnects and reconnects with the server.
   *
   * @returns {Presence}
   *
   * @deprecated Use synchronizeState function instead
   */
  static syncState(currentState, newState, onJoin, onLeave){
    let state = this.clone(currentState)
    let joins = {}
    let leaves = {}

    this.map(state, (key, presence) => {
      if(!newState[key]){
        leaves[key] = presence
      }
    })
    this.map(newState, (key, newPresence) => {
      let currentPresence = state[key]
      if(currentPresence){
        let newRefs = newPresence.metas.map(m => m.phx_ref)
        let curRefs = currentPresence.metas.map(m => m.phx_ref)
        let joinedMetas = newPresence.metas.filter(m => curRefs.indexOf(m.phx_ref) < 0)
        let leftMetas = currentPresence.metas.filter(m => newRefs.indexOf(m.phx_ref) < 0)
        if(joinedMetas.length > 0){
          joins[key] = newPresence
          joins[key].metas = joinedMetas
        }
        if(leftMetas.length > 0){
          leaves[key] = this.clone(currentPresence)
          leaves[key].metas = leftMetas
        }
      } else {
        joins[key] = newPresence
      }
    })
    return this.syncDiff(state, {joins: joins, leaves: leaves}, onJoin, onLeave)
  }

  /**
   *
   * Used to sync a diff of presence join and leave events from the server, as
   * they happen. Like `syncState`, `syncDiff` accepts optional `onChange`
   * callback to react to a user joining or leaving from a device.
   *
   * onChange callback will be invoked with three arguments:
   * 1. key - presence key (e.g. user-5)
   * 2. oldPresence - presence object before the sync
   * 3. newPresence - presence object after the sync
   *
   * **NOTE**: This function mutates the state object that is passed to this
   * function as the first argument.
   *
   * @returns {Presence}
   */
   static synchronizeDiff(state, {joins, leaves}, onChange){
    const changes = {}
    this.map(joins, (key, newPresence) => {
      changes[key] = {joinedMetas: newPresence.metas, leftMetas: [], update: newPresence}
    })
    this.map(leaves, (key, leftPresence) => {
      if (changes[key]) {
        changes[key].leftMetas = leftPresence.metas;
      } else {
        changes[key] = {joinedMetas: [], leftMetas: leftPresence.metas, update: leftPresence}
      }
    })

    this.map(changes, (key, {joinedMetas, leftMetas, update}) => {
      const joinedRefs = joinedMetas.map(m => m.phx_ref)
      const refsToRemove = leftMetas.map(m => m.phx_ref)
      const oldPresence = state[key];

      const newPresence = {metas: oldPresence ? oldPresence.metas : []};
      newPresence.metas = newPresence.metas
        .filter(m => joinedRefs.indexOf(m.phx_ref) === -1)
        .concat(joinedMetas)
        .filter(p => refsToRemove.indexOf(p.phx_ref) === -1)

      Object.keys(update).forEach(key => {
        // metas is already handled above separately
        if (key !== "metas") newPresence[key] = update[key];
      })

      if (newPresence.metas.length === 0) {
        // Delete the presence from the state when the metas are empty
        delete state[key]
      } else {
        // Update the old presence with the new presence in one atomic
        // operation
        state[key] = newPresence;
      }

      // Only notify onChange when there were any changes. If there were
      // changes but the old metas and new betas are still empty then there's
      // no reason to notify onChange callback.
      if (onChange) onChange(key, oldPresence, newPresence)
    });

    return state;
  }

  /**
   *
   * Used to sync a diff of presence join and leave
   * events from the server, as they happen. Like `syncState`, `syncDiff`
   * accepts optional `onJoin` and `onLeave` callbacks to react to a user
   * joining or leaving from a device.
   *
   * @returns {Presence}
   *
   * @deprecated Use synchronizeDiff function instead
   */
  static syncDiff(state, diff, onJoin, onLeave){
    let {joins, leaves} = this.clone(diff)
    if(!onJoin){ onJoin = function (){ } }
    if(!onLeave){ onLeave = function (){ } }

    this.map(joins, (key, newPresence) => {
      let currentPresence = state[key]
      state[key] = this.clone(newPresence)
      if(currentPresence){
        let joinedRefs = state[key].metas.map(m => m.phx_ref)
        let curMetas = currentPresence.metas.filter(m => joinedRefs.indexOf(m.phx_ref) < 0)
        state[key].metas.unshift(...curMetas)
      }
      onJoin(key, currentPresence, newPresence)
    })
    this.map(leaves, (key, leftPresence) => {
      let currentPresence = state[key]
      if(!currentPresence){ return }
      let refsToRemove = leftPresence.metas.map(m => m.phx_ref)
      currentPresence.metas = currentPresence.metas.filter(p => {
        return refsToRemove.indexOf(p.phx_ref) < 0
      })
      onLeave(key, currentPresence, leftPresence)
      if(currentPresence.metas.length === 0){
        delete state[key]
      }
    })
    return state
  }

  /**
   * Returns the array of presences, with selected metadata.
   *
   * @param {Object} presences
   * @param {Function} chooser
   *
   * @returns {Presence}
   */
  static list(presences, chooser){
    if(!chooser){ chooser = function (key, pres){ return pres } }

    return this.map(presences, (key, presence) => {
      return chooser(key, presence)
    })
  }

  // private

  static map(obj, func){
    return Object.getOwnPropertyNames(obj).map(key => func(key, obj[key]))
  }

  static clone(obj){ return JSON.parse(JSON.stringify(obj)) }
}
