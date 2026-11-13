![pxnode by Kinora](banner.png)

## Kinora pxnode

Controls a pxnode 4 or px4i over its HTTP API. Add one connection per node. To reach a whole zone from one
connection, tick **Whole zone** on an action.

### Connection

- **Node IP address**: shown on the node's screen.
- **Password**: only if the node has one. After a refused password the module stops until the settings are changed.
- **Poll interval**: the node cannot tell Companion about a change, so it is read at this interval. A change made
  elsewhere shows up after this time. A change made from Companion shows at once.

### Actions

- **Launch preset**: presets are chosen by number, 1 to 12, and the dropdown shows each one's current name. A button
  follows the number: if the list is reordered, it launches what is now at that number. Presets show in Standalone mode
  only.
- **Next, previous or random preset**
- **Blackout**, **Full colour**: on, off or toggle.
- **Identify node**
- **GPI input** (px4i only): acts as the contact would, with the input's saved settings. A hold input stays closed
  until it gets a release: put Press on button down and Release on button up. A release that cannot reach the node is
  sent again when the node answers, and an input left closed is opened when the connection is disabled.

The module has no action that writes to the node's flash memory.

### Feedbacks

Preset is active, Preview running, Blackout on, Full colour on, Input lost, GPI input closed.

### Variables

Active preset number and name, the name of each preset, node name, temperature, CPU load, zone role, input state, source
and rate, and for each GPI input its state and closure count.

A short contact can open again between two polls, so a closure may not show as closed. To trigger on a closure, watch
the input's count, and allow for the poll interval.
