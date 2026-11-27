import { describe, expect, it } from 'vitest';
import { placeMenu, type AnchorRect } from './menu-placement.js';

const VIEWPORT = { width: 360, height: 740 };

/** A button 40 px tall. */
function anchor(left: number, top: number, width = 100): AnchorRect {
  return { left, right: left + width, top, bottom: top + 40, width };
}

describe('placeMenu', () => {
  it('opens under a button on the left, lined up with its left edge', () => {
    expect(placeMenu(anchor(16, 100), VIEWPORT, 'bottom')).toEqual({
      left: 16,
      top: 144,
      minWidth: 100,
      maxHeight: 320,
    });
  });

  it('lines up with the right edge of a button on the right, so it stays on screen', () => {
    expect(placeMenu(anchor(244, 100), VIEWPORT, 'bottom')).toMatchObject({
      right: 16,
    });
  });

  it('opens above a button when asked to and there is room', () => {
    expect(placeMenu(anchor(16, 680), VIEWPORT, 'top')).toEqual({
      left: 16,
      bottom: 64,
      minWidth: 100,
      maxHeight: 320,
    });
  });

  it('opens above a button that has too little room under it', () => {
    expect(placeMenu(anchor(16, 600), VIEWPORT, 'bottom')).toMatchObject({
      bottom: 144,
      maxHeight: 320,
    });
  });

  it('opens under a button that has too little room above it', () => {
    expect(placeMenu(anchor(16, 100), VIEWPORT, 'top')).toMatchObject({
      top: 144,
      maxHeight: 320,
    });
  });

  it('shrinks to the room there is on a short screen, on the roomier side', () => {
    const shortViewport = { width: 360, height: 300 };

    expect(placeMenu(anchor(16, 60), shortViewport, 'bottom')).toMatchObject({
      top: 104,
      maxHeight: 188,
    });
  });

  it('is never narrower than its button', () => {
    expect(placeMenu(anchor(16, 100, 256), VIEWPORT, 'bottom').minWidth).toBe(
      256,
    );
  });
});
