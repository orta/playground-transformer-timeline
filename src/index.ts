import type { PlaygroundPlugin, PluginUtils } from "./vendor/playground";
import type { TypeChecker,  CompilerOptions, SourceFile, ModuleKind } from "typescript";

const makePlugin = (utils: PluginUtils) => {

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

        const program = await sandbox.createTSProgram();

        let checker: TypeChecker = program.getTypeChecker();
        let sourceFile = program.getSourceFile(sandbox.filepath);
        let options = sandbox.getCompilerOptions();

        // @ts-expect-error - private API
        const emitResolver = checker.getEmitResolver(sourceFile, neverCancel);

        // This gets filled out as the emitter runs below
        const dtsOutputs: { index: number, text: string, filename: string }[] = [];
        const jsOutputs: { index: number, text: string, filename: string }[] = [];

        // @ts-expect-error Private API
        const allTransformers = ts.getTransformers(options, [], false);
        console.log(allTransformers.scriptTransformers)
        
        // Loop through the script transformers going from [1], [1, 2], [1, 2, 3] ... 
        allTransformers.scriptTransformers.forEach((_t, index) => {
          const transformersToThis = [...allTransformers.scriptTransformers].splice(0, index + 1);

          const writeFile = (name, text) => {
            if(name.endsWith(".js")) {
              jsOutputs.push({
                filename: name,
                index,
                text,
              });
            }
          }

          const emitHost = createEmitHost(options, sourceFile, ts, writeFile);
          const incrementalTransformers = {
            scriptTransformers: transformersToThis,
            declarationTransformers: allTransformers.declarationTransformers
          }

          // @ts-expect-error Private API
          ts.emitFiles(
            emitResolver,
            emitHost,
            undefined, // target source file (doesn't seem to work when I set it)
            incrementalTransformers, // an incremental subset of allTransformers
            false, // only DTS
            false, // only build info
            false // force DTS
          );
        });

         
        // Loop through the declaration transformers going from [1], [1, 2], [1, 2, 3] ... 
        allTransformers.declarationTransformers.forEach((_t, index) => {
          const transformersToThis = [...allTransformers.declarationTransformers].splice(0, index + 1);

          const writeFile = (name, text) => {
            if(name.endsWith(".d.ts")) {
              dtsOutputs.push({
                filename: name,
                index,
                text,
              });
            }
          }

          const emitHost = createEmitHost(options, sourceFile, ts, writeFile);
          const incrementalTransformers = {
            scriptTransformers: allTransformers.scriptTransformers,
            declarationTransformers: transformersToThis
          }

          // @ts-expect-error Private API
          ts.emitFiles(
            emitResolver,
            emitHost,
            undefined, // target source file (doesn't seem to work when I set it)
            incrementalTransformers, // an incremental subset of allTransformers
            false, // only DTS
            false, // only build info
            false // force DTS
          );
        });

        const ds = utils.createDesignSystem(display)
        ds.clear()
        
        const filetabs = ds.createTabBar()
        filetabs.id = "transform-files"
        const stagetabs = ds.createTabBar()
        stagetabs.id = "transform-stages"
        const code = ds.code("");

        const jsNames = getScriptTransformerNames(options, ts)
        const dtsNames = ["DTS"];

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
      };
    },
  };

  return customPlugin;
};

// Some filler stuff we need to get stuff working with the private APIs

const createEmitHost = (
  options: CompilerOptions,
  sourceFile: SourceFile,
  ts: typeof import("typescript"),
  writeFile: any
) => {
  const emitHost = {
    getPrependNodes: () => [],
    getCanonicalFileName: (i) => i,
    getCommonSourceDirectory: () => ".",
    getCompilerOptions: () => options,
    getCurrentDirectory: () => "",
    getNewLine: () => "\n",
    getSourceFile: () => sourceFile,
    getSourceFileByPath: () => sourceFile,
    getSourceFiles: () => [sourceFile],
    getLibFileFromReference: () => {
      throw new Error("not implemented");
    },
    isSourceFileFromExternalLibrary: () => false,
    getResolvedProjectReferenceToRedirect: () => undefined,
    getProjectReferenceRedirect: () => undefined,
    isSourceOfProjectReferenceRedirect: () => false,
    writeFile: writeFile,
    isEmitBlocked: () => false,
    readFile: (f) =>  sourceFile.text,
    fileExists: (f) =>  true,
    useCaseSensitiveFileNames: () => true,
    getProgramBuildInfo: () => undefined,
    getSourceFileFromReference: () => undefined,
    // @ts-ignore private API, might not even be used
    redirectTargetsMap: ts.createMultiMap(),
  };
  return emitHost;
};

const neverCancel = {
  isCancellationRequested() {
    return false;
  },
  throwIfCancellationRequested() {},
};

// Direct rip of https://github.com/microsoft/TypeScript/blob/fb4d53079b050abf6bfb4582ee0624ec484f7876/src/compiler/transformer.ts#L37
// Switching the transformers with strings for the names
function getScriptTransformerNames(compilerOptions: CompilerOptions, ts: typeof import("typescript")): string[] {
  const jsx = compilerOptions.jsx;
  // @ts-expect-error - private api
  const languageVersion = ts.getEmitScriptTarget(compilerOptions);
  // @ts-expect-error - private api
  const moduleKind = ts.getEmitModuleKind(compilerOptions);
  const transformers: string[] = [];
  
  transformers.push("TS");
  transformers.push("Class Fields");

  if (jsx === ts.JsxEmit.React) {
      transformers.push("JSX");
  }

  if (languageVersion < ts.ScriptTarget.ESNext) {
      transformers.push("ESNext");
  }

  if (languageVersion < ts.ScriptTarget.ES2020) {
      transformers.push("ES2020");
  }

  if (languageVersion < ts.ScriptTarget.ES2019) {
      transformers.push("ES2019");
  }

  if (languageVersion < ts.ScriptTarget.ES2018) {
      transformers.push("ES2018");
  }

  if (languageVersion < ts.ScriptTarget.ES2017) {
      transformers.push("ES2017");
  }

  if (languageVersion < ts.ScriptTarget.ES2016) {
      transformers.push("ES2016");
  }

  if (languageVersion < ts.ScriptTarget.ES2015) {
      transformers.push("ES2015");
      transformers.push("Generators");
  }

  transformers.push(getModuleTransformer(moduleKind, ts));

  // The ES5 transformer is last so that it can substitute expressions like `exports.default`
  // for ES3.
  if (languageVersion < ts.ScriptTarget.ES5) {
      transformers.push("ES5");
  }

  return transformers;
}

function getModuleTransformer(moduleKind: ModuleKind,ts: typeof import("typescript")): string {
  switch (moduleKind) {
      case ts.ModuleKind.ESNext:
      case ts.ModuleKind.ES2020:
      case ts.ModuleKind.ES2015:
          return "ES Module";
      case ts.ModuleKind.System:
          return "System";
      default:
          return "CommonJs/AMD/UMD";
  }
}


export default makePlugin;
