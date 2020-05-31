import type { PlaygroundPlugin, PluginUtils } from "./vendor/playground";
import type { TypeChecker,  CompilerOptions, SourceFile, ModuleKind } from "typescript";

// @ts-ignore
import Worker from 'web-worker:./transformers.worker.ts';

const makePlugin = (utils: PluginUtils) => {
  const worker = new Worker();
  // @ts-ignore
  worker.postMessage({ action: "start", loaderSrc: window.loaderSrc, requireConfig: window.requireConfig });

  const customPlugin: PlaygroundPlugin = {
    id: "transforms",
    displayName: "Transformers",
    didMount: (sandbox, container) => {
      const ds = utils.createDesignSystem(container);
      const ts = sandbox.ts;
      
      const intro = ds.p("");

      const updateIntro = () => {
        let options = sandbox.getCompilerOptions();
        const targeting = `Targeting ${ts.ScriptTarget[options.target]} with module ${ts.ModuleKind[options.module]}.`
        intro.textContent = `This plugin visualizes each step of the TypeScript transformer pipeline based on your compiler settings. ${targeting}`
      }
      updateIntro()

      const startButton = document.createElement("input");
      startButton.type = "button";
      startButton.value = "Generate transform stages";
      container.appendChild(startButton);

      const display = document.createElement("div")
      container.appendChild(display)

      startButton.onclick = async () => {
        updateIntro()

        worker.postMessage({ action: "transform", filepath: sandbox.filepath, text: sandbox.getText(), options: sandbox.getCompilerOptions() });
      };

      worker.addEventListener('message', (msg: any) => {
        console.log(msg)

        if (msg.data.actions !== "results") return

        const { jsNames, dtsNames, jsOutputs, dtsOutputs } = msg.data

        const ds = utils.createDesignSystem(display)
        ds.clear()
        
        const filetabs = ds.createTabBar()
        filetabs.id = "transform-files"
        const stagetabs = ds.createTabBar()
        stagetabs.id = "transform-stages"
        const code = ds.code("");

        ["JavaScript", "DTS"].forEach((name, i) => {
          const button = ds.createTabButton(name)
          const currentStages = i === 0 ? jsOutputs : dtsOutputs
          const names = i === 0 ? jsNames : dtsNames
          
          button.onclick = () => {
            document.querySelectorAll("#transform-files > button").forEach(b => b.classList.remove("active"))
            button.classList.add("active")

            // We're gonna replace all the tabs for stages
            while (stagetabs.firstChild) {
              stagetabs.removeChild(stagetabs.firstChild)
            }
            
            // Get all the relevant stages, make tabs for them
            currentStages.forEach((s, j) => {
              const isActive = (j === 0 || currentStages[j-1].text !== s.text)

              const stageButton = ds.createTabButton(names[s.index])
              if (!isActive) stageButton.disabled = true

              // When you hover over these buttons then show the code for that stage
              stageButton.onmouseover = () => {
                document.querySelectorAll("#transform-stages > button").forEach(b => b.classList.remove("active"))
                stageButton.classList.add("active")

                const lang = s.filename.endsWith("js") ? "javascript" : "typescript"
                sandbox.monaco.editor.colorize(s.text, lang, {}).then(coloredJS => {
                  code.innerHTML = coloredJS
                })
              }

              stagetabs.appendChild(stageButton)
              if (j === 0) stageButton.onmouseover({} as any)
            })
          }

          filetabs.appendChild(button)
          if(i === 0) button.click()
        });
      });
    },
  };

  return customPlugin;
};

export default makePlugin;
