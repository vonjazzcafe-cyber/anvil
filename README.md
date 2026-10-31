# Anvil

A Unity-style editor that runs in the browser, built so you can keep working on Unity C# scripts on any computer (for example a slow university PC) and paste the code into Unity unchanged.

- **Real C#.** Scripts are compiled in the page by the real C# compiler (Roslyn, C# 9 like Unity 6), using Unity's defines (`UNITY_EDITOR`, `UNITY_6000_3_OR_NEWER`, `ENABLE_INPUT_SYSTEM` …).
- **The UnityEngine API**, re-implemented with the same names and behaviour: `MonoBehaviour` and the message order (Awake → OnEnable → Start → FixedUpdate → Update → LateUpdate …), coroutines, `Transform`, `Vector3`, `Quaternion` (same Euler order), `Mathf`, `Time`, `Debug.Log` with clickable line numbers, `Instantiate`/`Destroy`, prefabs, ScriptableObjects, the new Input System and the old `Input` class, `Rigidbody`/colliders/joints/raycasts with collision and trigger messages (on PhysX 5, the physics engine family Unity uses), `CharacterController` (with `OnControllerColliderHit`), 2D physics (`Rigidbody2D`, the 2D colliders, joints and effectors, `Physics2D` queries, on Box2D like Unity) and `SpriteRenderer`, imported 3D models (glTF/GLB, FBX, OBJ, STL) with skinned meshes, `Animator` with Animator Controllers (states, transitions, parameters, blend trees, layers) and the legacy `Animation` component, meshes built from code, materials and textures, `LineRenderer`/`TrailRenderer`/`ParticleSystem`, `OnGUI`, `PlayerPrefs`, `SceneManager`, `JsonUtility`.
- **Unity UI (uGUI) and TextMesh Pro**: Canvas (Overlay and World Space), Canvas Scaler, `RectTransform` with anchors and pivots, Image (including Filled bars), Raw Image, Text, `TextMeshProUGUI` and 3D `TextMeshPro`, Button, Toggle, Slider, Scrollbar, Scroll View, Input Field, Dropdown, Mask/RectMask2D, Canvas Group, layout groups and Content Size Fitter, the EventSystem with all the pointer interfaces (`IPointerClickHandler` …), and *On Click ()* lists set in the Inspector. **GameObject › UI** builds them like Unity, and the Game view shows the UI while you edit (click to select, drag to move).
- **Editor**: Hierarchy, Scene view with move/rotate/scale handles, Game view, Inspector (serialized fields, `[Header]`, `[Range]` …), Project window, Console, Project Settings (tags, layers, physics matrix, input handling, script order).
- **Your work goes back to Unity**: *Export to Unity* gives a zip with your scripts as normal `.cs` files plus an editor script that rebuilds your scenes, prefabs and materials in Unity (*Tools › Anvil › Import Project*).
- **Your projects follow you**: saved in the browser automatically, and synced to a GitHub repository with *File › Sync with GitHub*.

## Put it online with GitHub Pages (once, about 5 minutes)

1. On github.com click **New repository**. Name it `anvil`, make it **Public** (free GitHub Pages needs a public repo; your *projects* can live in private repos), and create it.
2. On the new repo's page click **uploading an existing file**.
3. Unzip `anvil-site.zip` on your computer, open the unzipped folder, select **everything inside it** (`index.html`, `sw.js`, `editor`, `engine`, `vendor`, `README.md`, `anvil-source.zip`) and drag it onto the GitHub page. Wait for the upload to finish, then click **Commit changes**.
4. Go to the repo's **Settings › Pages**. Under *Build and deployment* choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and click **Save**.
5. After a minute or two, your editor is at `https://<your-username>.github.io/anvil/`. Bookmark it.

The first visit downloads about 20 MB (the C# compiler and runtime). After that the browser keeps a copy: Anvil opens straight away, even with no internet.

**Updating Anvil later:** upload the files of the new `anvil-site.zip` the same way (GitHub replaces files with the same name). Next time you open the editor it shows *A new version of Anvil is ready* — click **Reload**. Only the parts that changed are downloaded again, and your projects are kept. (If your repository still has `src`, `tools` and `nuget.config` folders from an older version, you can delete them: the sources are now inside `anvil-source.zip`.)

## Keep the project as files on your computer

By default a project lives inside the browser. To work on real files instead (Chrome or Edge on a computer):

1. **File › Open Project Folder on This Computer…** and pick a folder. An empty folder gets the current project; a folder that already has an Anvil project in it opens that project.
2. From then on every change is saved into that folder within a second, as a normal folder tree: `Assets/Scripts/...cs`, your images, sounds and 3D models as their real files, and `Assets/Anvil/project.anvil.json` for scenes, prefabs, materials and settings. The badge next to the project name shows the folder.
3. You can edit the scripts with any other editor (VS Code, Notepad…). When you come back to Anvil it picks the changes up. New scripts you add to the folder appear too.
4. Next time, Anvil asks once for permission to the folder (click the 📁 badge or **File › Reconnect Project Folder**).

Put that folder in OneDrive, Google Drive or a GitHub repository and it follows you to every computer: open the same folder there with **Open Project Folder**.

While a folder is linked, Anvil also keeps the Console in `Logs/anvil-console.txt` (errors with file and line, warnings, `Debug.Log` output and stack traces, newest last). Other tools, or an AI assistant that can see the folder, can read what went wrong without screenshots.

**Panels:** drag a divider all the way to the edge to close the Hierarchy, Inspector or Project/Console panel; drag the thin strip it leaves back out (or double-click it) to reopen. The buttons at the top right and Alt+1/2/3 do the same.

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
- **Everything:** *Export to Unity* downloads a zip. Copy its `Assets` folder into your Unity project, wait for Unity to compile, then run **Tools › Anvil › Import Project**. Scenes, prefabs, materials, physics materials (3D and 2D), Animator Controllers, imported models, sprites, ScriptableObject assets, tags, layers, gravity, the collision matrix and Scenes In Build are recreated with the same values.
- The GitHub repository has the same layout (`Assets/…` plus `Assets/Anvil/project.anvil.json`), so you can also clone it straight into a Unity project.

## What's different from Unity

Anvil runs the same C# against a re-implementation of the UnityEngine API, so script logic, Transform maths and the order Unity calls your methods match. What can differ:

- **3D physics** runs on PhysX 5 with Unity's default settings (solver, iterations, sleep and bounce thresholds, contact offset), so stacking, friction, joints and `breakForce` behave like Unity. Results are close but not bit-identical to a Unity build. *Project Settings › Physics Engine* can switch to Rapier (lighter, less like Unity; no joint breaking).
- **2D physics** runs on Box2D (planck.js), the engine Unity's 2D physics is built on. Not yet: `CompositeCollider2D`, Buoyancy Effector 2D, rounded corners from Edge Radius, Rigidbody 2D interpolation. A Capsule Collider 2D is built from two circles and a box.
- **Sprites**: one image is one sprite (100 pixels per unit, centre pivot). No Sprite Editor slicing/sprite sheets, sorting layers (Order in Layer works), Sprite Masks or Tilemaps; *Sliced* and *Tiled* stretch the image.
- **Models and animation**: glTF/GLB, FBX, OBJ and STL import with their meshes, materials, textures, skinning and animation clips. Animator Controllers support states, transitions, parameters, 1D blend trees, layers, Any State and StateMachineBehaviours. Humanoid retargeting, IK, avatar masks and 2D blend trees aren't supported.
- **Rendering** is three.js: Standard/URP Lit-style materials with colour, texture, metallic, smoothness, emission and transparency. Custom shaders, Shader Graph, post-processing, lightmaps and terrain aren't supported. `UnityEditor` scripts don't run.
- UI text uses the browser's fonts, so line breaks can differ by a few pixels from Unity. Dropdowns open a simple list instead of copying their Template.
- After importing a project with TextMesh Pro text into Unity, accept Unity's prompt to *Import TMP Essentials* (once per project). glTF/GLB models need the glTFast package in Unity (FBX and OBJ work out of the box).
- Files your scripts write with `System.IO` live in memory while playing; download them from the **Files** tab.

## Keyboard shortcuts

| | |
|---|---|
| Q W E R | View / Move / Rotate / Scale tool |
| F | Frame selected |
| Right-drag + WASD/QE | Fly the Scene camera |
| Arrow keys (Shift = faster) | Move the Scene camera forward/back/sideways, relative to where it looks, without changing the view |
| Right-drag + mouse wheel or ↑/↓ | Change the Scene camera speed (used by WASD and the arrow keys; remembered) |
| Ctrl+P | Play / Stop |
| Ctrl+Shift+P / Ctrl+Alt+P | Pause / Step |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+D, Del, F2 | Duplicate, Delete, Rename |
| Ctrl+S | Save (in the code editor: save and compile) |
| Ctrl+Space | Code completion |

## Building from source

The site is static. Only the C# part needs building; its sources and build scripts are in `anvil-source.zip` (unzip it next to `index.html`):

- `src/Engine` — the UnityEngine implementation (`UnityEngine.dll`)
- `src/Host` — the WebAssembly host: Roslyn compiler, completion, bridge to the editor
- `editor/` — the editor UI (plain JavaScript modules, three.js, CodeMirror 6, PhysX, Rapier and planck.js physics)

Requirements: .NET 8 SDK and these packages in `tools/nupkgs`: `Microsoft.NETCore.App.Runtime.Mono.browser-wasm` 8.0.x, `Microsoft.NET.Sdk.WebAssembly.Pack` 8.0.x, `Microsoft.CodeAnalysis.Common` 4.8.0, `Microsoft.CodeAnalysis.CSharp` 4.8.0 (extract `lib/net7.0/*.dll` of the last two into `tools/roslyn`). Then run `tools/build.sh`, and `tools/package.sh` to make `anvil-site.zip`.

Third-party components keep their own licences (full texts in `vendor/THIRD-PARTY-NOTICES.txt`): three.js (MIT), NVIDIA PhysX (BSD-3-Clause) through physx-js-webidl (MIT), Rapier (Apache-2.0), planck.js (MIT), CodeMirror (MIT), fflate (MIT), .NET runtime and Roslyn (MIT). Unity is a trademark of Unity Technologies; Anvil is an independent project and contains no Unity code.
