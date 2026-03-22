'use strict';

// =============================================================================
// PLAY SYSTEM
// =============================================================================
//
// A Play represents a single intended touch and the positioning it requires
// from both players. Plays are chosen once per touch (or when the current
// play becomes infeasible), not every tick.
//
// LIFECYCLE
//   1. Each tick, the play-caller checks if the current play is still feasible.
//   2. If not (or if no play is active), it collects all feasible plays,
//      scores them by value(), and does a weighted random sample favoring
//      higher-value plays.
//   3. The chosen play is instantiated with the current game state. It picks
//      its internal parameters (p0, p1, ball target, support position) at
//      instantiation time and does not change them unless replaced.
//   4. Each tick the play writes posTargets[] for both players and calls
//      teamHit() when p0 is in range. The execution layer ignores posTargets
//      for the human active player (the joystick owns that player's movement).
//      Hitting fires the same way for both human and AI via teamHit() —
//      the human just gets their active player into position manually.
//      Plays contain zero special-casing for human vs AI.
//   5. After the touch executes, the play is cleared and a new one is chosen.
//
// PLAYER ROLES
//   Each play assigns exactly two roles at instantiation:
//     p0 — primary: the player who will make contact with the ball
//     p1 — secondary: the player who moves to the support position
//   Which is p0 and which is p1 is decided at instantiation based on
//   eligibility and proximity to the ball.
//
// FEASIBILITY vs VALUE
//   static isFeasible(team, ball) → bool
//     Hard gate. True if the play is physically and legally executable.
//     Called before instantiation. A play that is not feasible is never chosen.
//
//   static value(team, ball) → number
//     Continuous score reflecting how good this play is right now.
//     Considers teammate positioning, time available, opponent positions, etc.
//     Called before instantiation. Used for weighted random sampling.
//
// PLAY SELECTION
//   Feasible plays are collected, scored by value(), then a weighted random
//   sample is drawn — higher value plays are more likely but not certain.
//   This gives natural variation while still making good choices.
//   Play selection happens once per touch and when current play is infeasible.
//   A play is NOT replaced just because a better option appears mid-execution —
//   only when it becomes infeasible.
//
// POSITIONING
//   Each tick, the active play writes posTargets[] on the team for both players.
//   tickTeamPositioning() executes the movement — unchanged from current code.
//   The human active player is already skipped in tickTeamPositioning, so
//   plays need no special casing.
//   posAfterPass/Set/Attack are removed — plays own all positioning.
//   planTeamReceive is removed — replaced by play-caller.
//
// HITTING
//   The play calls teamHit() when p0 is in range. This replaces aiTickTeam.
//   teamHit() works identically for human and AI players — the only difference
//   is the human moves their active player via joystick rather than posTargets.
//
// BALL TARGET
//   ballTarget() is computed at instantiation for the intended destination,
//   then recomputed each tick to refine as ball trajectory becomes clearer.
//
// =============================================================================
// PLAY LIST
// =============================================================================
//
//  1. ReadyToReceive  — No contact. Both players spread symmetrically to cover
//                       court. No distinct roles. Chosen when ball is on
//                       opponent side and no contact is imminent.
//
//  2. Serve           — Standard serve from behind baseline. p0 serves to a
//                       chosen target zone on opponent court. p1 moves to
//                       base receive position.
//
//  3. JumpServe       — p0 jump serves with higher speed and flatter arc.
//                       Higher value than Serve when p0 is a strong jumper.
//                       p1 moves to base receive position.
//
//  4. ReceiveToSet    — p0 digs ball high toward p1's set position. p1 moves
//                       to set position to execute the next touch. Covers
//                       both serve receive and general dig situations.
//                       Feasible when hit count < 2.
//
//  5. ReceiveToAttack — p0 digs ball high directly to attack position. p1
//                       moves to attack position. 2-touch play — skips the
//                       set. Feasible when hit count < 2.
//
//  6. SetToAttack     — p0 sets ball high to attack position. p1 moves to
//                       attack position to execute Attack on next touch.
//                       Feasible when hit count < 3.
//
//  7. SetDump         — p0 tips ball softly just over net. p1 recovers to
//                       base mid-court position. Chosen when opponent is out
//                       of position near net. Feasible when hit count < 3.
//
//  8. Attack          — p0 executes attack at attack position. Style (power
//                       spike, roll shot, tip, cut) chosen internally based
//                       on p0 position, opponent positioning, and randomness.
//                       p1 recovers to base mid-court position.
//                       Feasible when hit count < 3.
//
//  9. BumpOver        — Emergency. p0 gets ball over net from wherever they
//                       are. No setup. p1 recovers to base mid-court position.
//                       Feasible whenever an eligible player can reach the
//                       ball and hit count < 3. Low value unless no better
//                       option exists.
//
// 10. ReadyToBlock    — No contact. p0 moves to net at predicted attack x
//                       position to block. p1 covers deep behind. Chosen
//                       when opponent is executing or about to execute Attack.
//
// 11. Joust           — Ball predicted to land at or near net tape. p0 moves
//                       to net at ball x, jumps to contest. p1 covers nearby.
//                       Both teams may independently choose Joust on the same
//                       ball. Specialized tick code handles the contact loop.
//
// =============================================================================
// INTEGRATION MIGRATION PATH
// =============================================================================
//
//  1. Play writes posTargets[] each tick via tick()
//  2. tickTeamPositioning() executes movement — unchanged
//  3. Human active player already skipped there — no special casing needed
//  4. Play calls teamHit() when p0 in range — replaces aiTickTeam()
//  5. posAfterPass/Set/Attack removed — plays own positioning
//  6. planTeamReceive removed — replaced by play-caller
//
// =============================================================================
// BASE CLASS
// =============================================================================

class Play {
  // team  — the team this play belongs to
  // ball  — ball state at instantiation time
  constructor(team, ball) {
    this.team = team;
    this.p0id = null;  // primary: makes contact
    this.p1id = null;  // secondary: moves to support position
    this.intendedBallTarget = null; // chosen at instantiation, refined each tick
  }

  // Hard feasibility gate — called before instantiation
  static isFeasible(team, ball) { return false; }

  // Dynamic value score — called before instantiation
  static value(team, ball) { return 0; }

  // Drive both players each tick — write posTargets[] and call teamHit() as needed
  tick(team, ball) {}

  // Intended ball destination — recomputed each tick for refinement
  ballTarget(team, ball) { return null; }
}
