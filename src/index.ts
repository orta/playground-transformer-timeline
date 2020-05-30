import type { PlaygroundPlugin, PluginUtils } from "./vendor/playground";
import type { TypeChecker, CompilerHost, CompilerOptions, SourceFile } from "typescript";

const makePlugin = (utils: PluginUtils) => {

  const customPlugin: PlaygroundPlugin = {
    id: "transforms",
    displayName: "Transformers",
    didMount: (sandbox, container) => {
      const ds = utils.createDesignSystem(container);
      ds.p("This plugin will show each step of the TypeScript transformer pipeline, right now the process has no way to know the name of a transformer because the functions are minified.");

      const startButton = document.createElement("input");
      startButton.type = "button";
      startButton.value = "Generate transform stages";
      container.appendChild(startButton);

      const display = document.createElement("div")
      container.appendChild(display)

      startButton.onclick = async () => {
        const ts = sandbox.ts;
        const program = await sandbox.createTSProgram();

        // @ts-expect-error - private API
        let checker: TypeChecker = program.getDiagnosticsProducingTypeChecker();
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

        ["JavaScript", "DTS"].forEach((name, i) => {
          const button = ds.createTabButton(name)
          const currentStages = i === 0 ? jsOutputs : dtsOutputs
          
          button.onclick = () => {
            document.querySelectorAll("#transform-files > button").forEach(b => b.classList.remove("active"))
            button.classList.add("active")

            // We're gonna replace all the tabs for stages
            while (stagetabs.firstChild) {
              stagetabs.removeChild(stagetabs.firstChild)
            }
            
            // Get all the relevant stages, make tabs for them
            currentStages.forEach((s, j) => {

              const stageButton = ds.createTabButton((s.index + 1).toString())
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

export default makePlugin;
