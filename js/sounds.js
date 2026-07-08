const sounds = {
  correct: new Audio("sounds/correct.wav"),
  wrong: new Audio("sounds/wrong.wav"),
  complete: new Audio("sounds/complete.wav"),
};

function playSound(name) {
  const sfx = sounds[name];
  if (!sfx) return;
  sfx.currentTime = 0;
  sfx.play().catch(() => {
    // Browsers block autoplay before the first user interaction —
    // harmless to ignore since this only fires after a button click.
  });
}
