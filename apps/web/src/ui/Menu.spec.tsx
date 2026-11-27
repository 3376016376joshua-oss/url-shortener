import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu, MenuItem, MenuLink } from './Menu.js';

const onRename = vi.fn();

function renderMenu() {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <>
            <Menu label="Workspaces" button="Acme">
              <MenuLink to="/w/acme" selected>
                Acme
              </MenuLink>
              <MenuLink to="/w/globex" selected={false}>
                Globex
              </MenuLink>
              <MenuItem onSelect={onRename}>Rename</MenuItem>
            </Menu>
            <button type="button">Outside</button>
          </>
        ),
      },
    ],
    { initialEntries: ['/w/acme'] },
  );
  render(<RouterProvider router={router} />);
  return { router, user: userEvent.setup() };
}

function focusedText(): string | null {
  return document.activeElement?.textContent ?? null;
}

describe('Menu', () => {
  afterEach(() => {
    cleanup();
    onRename.mockClear();
  });

  it('opens on its first item and says so on the button', async () => {
    const { user } = renderMenu();
    const button = screen.getByRole('button', { name: 'Acme' });
    expect(button.getAttribute('aria-expanded')).toBe('false');

    await user.click(button);

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu', { name: 'Workspaces' })).toBeDefined();
    expect(focusedText()).toBe('Acme');
  });

  it('moves between items with the arrow keys, Home, and End, wrapping around', async () => {
    const { user } = renderMenu();
    await user.click(screen.getByRole('button', { name: 'Acme' }));

    await user.keyboard('{ArrowDown}');
    expect(focusedText()).toBe('Globex');
    await user.keyboard('{End}');
    expect(focusedText()).toBe('Rename');
    await user.keyboard('{ArrowDown}');
    expect(focusedText()).toBe('Acme');
    await user.keyboard('{ArrowUp}');
    expect(focusedText()).toBe('Rename');
    await user.keyboard('{Home}');
    expect(focusedText()).toBe('Acme');
  });

  it('marks which of a list of choices is current', async () => {
    const { user } = renderMenu();
    await user.click(screen.getByRole('button', { name: 'Acme' }));

    const choices = screen.getAllByRole('menuitemradio');

    expect(
      choices.map((choice) => choice.getAttribute('aria-checked')),
    ).toEqual(['true', 'false']);
  });

  it('closes on Escape and gives focus back to the button', async () => {
    const { user } = renderMenu();
    const button = screen.getByRole('button', { name: 'Acme' });
    await user.click(button);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('closes on a press outside and on Tab', async () => {
    const { user } = renderMenu();
    const button = screen.getByRole('button', { name: 'Acme' });

    await user.click(button);
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(button);
    await user.tab();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('runs an action item, closes, and returns focus to the button', async () => {
    const { user } = renderMenu();
    await user.click(screen.getByRole('button', { name: 'Acme' }));

    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));

    expect(onRename).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
    // So a dialog the action opens can hand focus back when it closes.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Acme' }),
    );
  });

  it('follows a link item and closes', async () => {
    const { router, user } = renderMenu();
    await user.click(screen.getByRole('button', { name: 'Acme' }));

    await user.click(screen.getByRole('menuitemradio', { name: 'Globex' }));

    expect(router.state.location.pathname).toBe('/w/globex');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
