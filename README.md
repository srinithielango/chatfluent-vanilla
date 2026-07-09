# ChatFluent — Single-Page build

This is your original chatfluent-vanilla app collapsed from 8 HTML pages +
13 JS files into:

  index.html   - one shell page
  style.css    - your original stylesheet, unchanged
  app.js       - all page logic, merged, driven by a tiny hash router

Navigation now happens via URL hash instead of separate files:
  #/dashboard
  #/category?id=shopping
  #/play?levelId=abc123
  #/level-complete?levelId=..&categoryId=..&xp=10&hearts=3
  #/level-failed?categoryId=shopping
  #/challenge
  #/play-challenge?levelId=abc123

These files stay separate on purpose (they're backend/tooling, not client code):
  api/check-challenge-answer.js   - serverless function, deploy as-is
  scripts/                        - one-time DB seed scripts, run from terminal
  sounds/                         - audio assets

To use in your main project: drop these files into a subfolder (e.g. /chatfluent/),
keep api/ wherever your main project's serverless functions live, and link to
/chatfluent/index.html from your main nav.
