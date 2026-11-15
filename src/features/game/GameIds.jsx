'use client';

import { createContext, useContext } from 'react';

const Prefix = createContext('');

// App Router can retain hidden game routes in the DOM. Give every pack distinct
// label/description targets while retaining the regular game's existing IDs.
export function GameIdScope({ packId, children }) {
  return <Prefix.Provider value={packId ? `lab-${packId}-` : ''}>{children}</Prefix.Provider>;
}
export function useGameId(name) { return useContext(Prefix) + name; }
