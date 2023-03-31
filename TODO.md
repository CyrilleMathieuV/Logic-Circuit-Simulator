# TODO List for Logic System Simulator


## High priority

 * Incrementable register
 * Get key events also when multiple editors are on the same page
 * Copy-paste
 * Hide mouseover when mouse leaves web component boundaries
 * Adder orientation
 * Prevent click event if right-click and when dragging
 * More consistently set things dirty


## Medium priority

 * Load/save RAM/ROM contents via file and editor
 * High-Z bus logic
 * ROM
 * Mnemonic in context menu
 * Undo/redo as buttons
 * Custom component creation
 * (Address) decoder: 2, 3, 4 bit versions
 * Add mouseovers to new components
 * Save/restore using browser's storage
    * standalone
      * no long term storage
      * sessionstorage pour recharger la page et restaurer le contenu
      * localstorage pour reproposer le contenu si rechargé plus tard, 1 seule entrée
      * avec un bouton
    * embedded
      * with manually-defined id
      * only with sessionstorage


## Low priority

 * Alternative representation for push or toggle buttons
 * Allow repeating deletions with Cmd+Y
 * Edge detector?
 * Highlight only nodes when dragging
 * Don't store Z in memory cells, but unknown instead
 * Add rich HTML annotations
 * Disable/hide input of component (e.g., to make exercise to prevent alu from knowing how to do a subtraction)
 * Lock component to some "parent" to move them more intuitively?
 * Add external component by drag-and-drop from file
 * Implement Quine–McCluskey algorithm for function normalization


### DONE

 * Lock position
 * Show selected RAM contents
 * Draw n-x-1 mux/demux compactly
 * Remove stale tooltips when deleting components
 * Replace input with clock and conversely
 * Make left buttons honor dark mode
 * Generic shared drawing code
 * Move width and height computation to component's def
 * 8-bit counter
 * Replace with component with different params (e.g. 4-bit to 8-bit)
 * prevent clock "backlog" from running like crazy
 * 8-bit adder, ALU, register, ROM, display
 * 4-bit adder with carry in and out
 * Add waypoint by dragging; add wire by alt-dragging from existing wire
 * Correct register display when horizontal
 * 8-bit register
 * ShiftRegister
 * Mux/Demux 16:8, 8:16
 * Zoom
 * Undo/redo
 * 4-bit and 8-bit display without interpretation
 * Separate V and Cout output for ALU
 * 8-bit input, 8-bit RAM
 * Add label, rectangle
 * Demux
 * Mux graphics
 * Allow to force initial input to stabilize a circular circuit (e.g. SR latch)
 * Allow dynamic component names
 * Make input constant 0 or 1
 * Allow wire coloring
 * Handle rapid second click as a repeated click if doubleClick not handled
 * Embed images with esbuild's dataurl/text loader; import CSS and HTML templates as well
 * Switch to embeddable web components with single JS file
 * Chainable 4-bit counter
 * Option to have disconnected as high-Z
 * 16 x 4 bit memory
 * Editor-level options and UI to set options
 * Can now color all wires and nodes as neutral
 * Replace fillText with drawLabel
 * Edge detector -- can now be done with XOR(A, NOT(NOT(A)))) with new propagation system
 * Fix flipflop update issue, e.g. in shift register
 * Multiplexers
 * Use esbuild to create bundle
 * Add 4-bit register
 * Add 4-bit dip switch showing value
 * Insert midpoints for wires to route them better
 * Get rid of p5
 * Add contextual menu to displays and adder
 * Refactor component hierarachy, in-memory list and JSON repr
 * Extract common stuff into Component superclass
 * Align input and output nodes on grid
 * Connect components with Shift key for overlapping nodes
 * Make 'esc' cancel item placement (wire or component)
 * Allow forcing output nodes to a predefined value
 * Allow inputs to be undetermined ('?')
 * Allow gates to be drawn in an undetermined shape
 * Change cursor depending on possible interaction
 * Validate JSON when loaded, define JSON types in a smart way
 * Allow changing modes, add admin mode to force nodes in states
 * Generate links or Markdown blocks with given diagram
 * Optimize draw calls
 * Support touch events
 * Unify click-and-drag also from left buttons instead of click-and-move
