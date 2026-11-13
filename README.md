![pxnode by Kinora: Bitfocus Companion module](./companion/banner.png)

# Kinora pxnode for Bitfocus Companion

Controls Kinora pxnode 4 and px4i pixel controllers from [Bitfocus Companion](https://bitfocus.io/companion): launch presets, trigger blackout and full colour, operate px4i GPI inputs, and show the node's live state on buttons.

The module talks to each node over its HTTP API. No firmware change or extra software is needed on the node.

> **Status: in development.** The module has been tested against a fake node and, for polling and live commands, against pxnode 4 and px4i hardware on firmware 2.0.2. It has not yet been tested inside Companion, and GPI has not yet been tested on hardware. It is not published in the Companion module list.

## Requirements

| Item      | Requirement                                                                         |
| --------- | ----------------------------------------------------------------------------------- |
| Node      | pxnode 4 or px4i with API version 1, reachable on TCP port 80                       |
| Companion | A version that can run Node 26 modules                                              |
| Network   | Companion must reach each node's IP address; nodes are not discovered automatically |

## Setup

1. Build the module, as described in [Development](#development).
2. In Companion, set the developer modules path to the folder that contains this repository.
3. Add one **Kinora pxnode** connection for each node.
4. Enter the node's IP address, shown on its screen.
5. Enter the password if the node has one.

Use **Whole zone** on an action to reach every node in a zone from one connection.

## Features

### Actions

| Action                          | Options                                       |
| ------------------------------- | --------------------------------------------- |
| Launch preset                   | Preset 1 to 12, fade, whole zone              |
| Next, previous or random preset | Direction, fade, whole zone                   |
| Blackout                        | On, off or toggle, fade, whole zone           |
| Full colour                     | On, off or toggle, channels, fade, whole zone |
| Identify node                   | None                                          |
| GPI input (px4i only)           | Input 1 to 4, press or release                |

### Feedbacks

- Preset is active
- Preview running
- Blackout on
- Full colour on
- Input lost
- GPI input closed (px4i only)

### Variables

| Group   | Variables                                                                    |
| ------- | ---------------------------------------------------------------------------- |
| Presets | `active_preset`, `active_preset_name`, `preset_1_name` to `preset_12_name`   |
| Node    | `node_name`, `temperature`, `cpu_load`, `zone_role`                          |
| Input   | `input_state`, `input_source`, `input_fps`                                   |
| GPI     | `gpi_1_closed` to `gpi_4_closed`, `gpi_1_count` to `gpi_4_count` (px4i only) |

The module also provides ready-made buttons for presets, navigation, outputs and GPI inputs.

## Behaviour to know

- **Preset numbers:** Companion uses 1 to 12. The module subtracts 1 for the API, which counts from 0. A button follows the number, so reordering the list changes what it launches.
- **Standalone mode:** presets show in Standalone mode only.
- **Polling:** the node cannot push changes, so it is read once a second by default. Changes made elsewhere appear after the next poll. Changes made from Companion appear at once.
- **Lost connection:** after 3 failed polls, feedbacks turn off and variables go blank until the node answers.
- **Refused password:** polling stops until the connection settings change, so the module does not extend the node's password delay.
- **GPI hold inputs:** put Press on button down and Release on button up. A release that fails is sent again when the node answers. Inputs left closed are opened when the connection is disabled or its settings change.
- **Short GPI closures:** a contact can open between two polls. To trigger on a closure, watch `gpi_N_count` rather than `gpi_N_closed`, and allow for the poll interval.
- **Flash memory:** no action writes settings to the node, because a save can freeze the outputs for 1 to 2 s.

See [companion/HELP.md](./companion/HELP.md) for the help shown inside Companion.

## Development

You need Node 26 and Yarn 4.

```sh
yarn          # install dependencies
yarn build    # build once, enough for Companion to load the module
yarn dev      # rebuild on change
yarn test     # build, then run the tests against a fake node
yarn lint     # check the code
yarn format   # format the code
yarn package  # create the package to submit
```

### Project layout

| Path                | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `src/client.ts`     | HTTP client for the node's API                              |
| `src/connection.ts` | Polling, lost connections, passwords, GPI releases          |
| `src/logic.ts`      | Preset numbering and variable values                        |
| `src/actions.ts`    | Companion actions                                           |
| `src/feedbacks.ts`  | Companion feedbacks                                         |
| `src/variables.ts`  | Companion variable definitions                              |
| `src/presets.ts`    | Ready-made Companion buttons                                |
| `test/`             | Tests, including a fake node that behaves like the firmware |

The API reference is `docs/reference/http-api.html` in the pxnode firmware repository.

## Licence

The code is under the MIT licence. See [LICENSE](./LICENSE).

The Kinora and pxnode names and logos are not covered by this licence.
