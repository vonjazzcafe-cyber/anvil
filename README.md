# Anvil

A Unity-style editor that runs in the browser, built so you can keep working on Unity C# scripts on any computer (for example a slow university PC) and paste the code into Unity unchanged.

- **Real C#.** Scripts are compiled in the page by the real C# compiler (Roslyn, C# 9 like Unity 6), using Unity's defines (`UNITY_EDITOR`, `UNITY_6000_3_OR_NEWER`, `ENABLE_INPUT_SYSTEM` …).
- **The UnityEngine API**, re-implemented with the same names and behaviour: `MonoBehaviour` and the message order (Awake → OnEnable → Start → FixedUpdate → Update → LateUpdate …), coroutines, `Transform`, `Vector3`, `Quaternion` (same Euler order), `Mathf`, `Time`, `Debug.Log` with clickable line numbers, `Instantiate`/`Destroy`, prefabs, ScriptableObjects, the new Input System and the old `Input` class, `Rigidbody`/colliders/joints/raycasts with collision and trigger messages, `OnGUI`, `PlayerPrefs`, `SceneManager`.
- **Editor**: Hierarchy, Scene view with move/rotate/scale handles, Game view, Inspector (serialized fields, `[Header]`, `[Range]` …), Project window, Console, Project Settings (tags, layers, physics matrix, input handling, script order).
- **Your work goes back to Unity**: *Export to Unity* gives a zip with your scripts as normal `.cs` files plus an editor script that rebuilds your scenes, prefabs and materials in Unity (*Tools › Anvil › Import Project*).
- **Your projects follow you**: saved in the browser automatically, and synced to a GitHub repository with *File › Sync with GitHub*.

## Put it online with GitHub Pages (once, about 5 minutes)

1. On github.com click **New repository**. Name it `anvil`, make it **Public** (free GitHub Pages needs a public repo; your *projects* can live in private repos), and create it.
2. On the new repo's page click **uploading an existing file**.
3. Unzip `anvil-site.zip` on your computer, open the unzipped folder, select **everything inside it** (`index.html`, `sw.js`, `editor`, `engine`, `vendor`, `src`, `tools`, `README.md`, `nuget.config`) and drag it onto the GitHub page. Wait for the upload to finish, then click **Commit changes**.
4. Go to the repo's **Settings › Pages**. Under *Build and deployment* choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and click **Save**.
5. After a minute or two, your editor is at `https://<your-username>.github.io/anvil/`. Bookmark it.

The first visit downloads about 20 MB (the C# compiler and runtime). After that the browser keeps a copy: Anvil opens straight away, even with no internet.

**Updating Anvil later:** upload the files of the new `anvil-site.zip` the same way (GitHub replaces files with the same name). Next time you open the editor it shows *A new version of Anvil is ready* — click **Reload**. Only the parts that changed are downloaded again, and your projects are kept.

## Using it at university

- Open your `github.io/anvil` link in Chrome or Edge (any recent browser works).
- Your project is saved in that browser on that computer. To carry it between computers, use **File › Sync with GitHub**:
  1. Create a second repository for your project (private is fine), e.g. `my-unity-scripts`.
  2. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with access to **only that repository** and permission **Contents: Read and write**.
  3. In Anvil: *File › Sync with GitHub*, paste the token, type `your-username/my-unity-scripts`, then **Push** to upload or **Pull** to download.
  - Don't tick *Remember the token* on a shared university PC.
- No GitHub? Use **File › Download Project Backup (.zip)** and **File › Import Project Backup (.zip)**.

## Fast iteration (no waiting for reloads)

- Changing a value in the Inspector never recompiles anything.
- Saving a script recompiles only in the background (a fraction of a second); the editor never freezes and nothing reloads.
- **While playing, every Inspector value is live**: change a speed, a Rigidbody's mass, a light's colour, an array element — the running game uses it immediately, with no restart. Like Unity, those changes are undone when you stop; to keep them, open the component's ⋮ menu, choose **Copy Component** while playing, then after stopping choose **Paste Component Values**.

## Getting your work into Unity

- **Just the code:** open the script in Anvil, *Copy all*, paste into the same file in Unity. It is the same C#.
- **Everything:** *Export to Unity* downloads a zip. Copy its `Assets` folder into your Unity project, wait for Unity to compile, then run **Tools › Anvil › Import Project**. Scenes, prefabs, materials, physics materials, ScriptableObject assets, tags, layers, gravity, the collision matrix and Scenes In Build are recreated with the same values.
- The GitHub repository has the same layout (`Assets/…` plus `Assets/Anvil/project.anvil.json`), so you can also clone it straight into a Unity project.

## What's different from Unity

- Physics runs on Rapier instead of PhysX. Script logic, Transform maths and the order Unity calls your methods match; bounces, friction and joint behaviour can differ slightly.
- Shapes are Unity's built-in primitives (cube, sphere, capsule, cylinder, plane, quad). Imported 3D models, textures, Animator/animation, audio playback, particles, terrain and `UnityEditor` scripts aren't supported yet.
- For on-screen UI use `OnGUI` (`GUI.Label`, `GUILayout.Button` …).
- Files your scripts write with `System.IO` live in memory while playing; download them from the **Files** tab.

## Keyboard shortcuts

| | |
|---|---|
| Q W E R | View / Move / Rotate / Scale tool |
| F | Frame selected |
| Right-drag + WASD/QE | Fly the Scene camera |
| Ctrl+P | Play / Stop |
| Ctrl+Shift+P / Ctrl+Alt+P | Pause / Step |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+D, Del, F2 | Duplicate, Delete, Rename |
| Ctrl+S | Save (in the code editor: save and compile) |
| Ctrl+Space | Code completion |

## Building from source

The site is static. Only the C# part needs building:

- `src/Engine` — the UnityEngine implementation (`UnityEngine.dll`)
- `src/Host` — the WebAssembly host: Roslyn compiler, completion, bridge to the editor
- `editor/` — the editor UI (plain JavaScript modules, three.js, CodeMirror 6, Rapier physics)

Requirements: .NET 8 SDK and these packages in `tools/nupkgs`: `Microsoft.NETCore.App.Runtime.Mono.browser-wasm` 8.0.x, `Microsoft.NET.Sdk.WebAssembly.Pack` 8.0.x, `Microsoft.CodeAnalysis.Common` 4.8.0, `Microsoft.CodeAnalysis.CSharp` 4.8.0 (extract `lib/net7.0/*.dll` of the last two into `tools/roslyn`). Then run `tools/build.sh`.

Third-party components keep their own licences: three.js (MIT), Rapier (Apache-2.0), CodeMirror (MIT), fflate (MIT), .NET runtime and Roslyn (MIT). Unity is a trademark of Unity Technologies; Anvil is an independent project and contains no Unity code.
