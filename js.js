const MultiCommonChunksBase = require('./index');

class MultiCommonChunksJS extends MultiCommonChunksBase {
  apply(compiler) {
    compiler.plugin('this-compilation', (compilation) => {

      compilation.plugin(['optimize-chunks'], (chunks) => {
        // only optimize once
        if(compilation[this.ident]) return;
        compilation[this.ident] = true;

        const extractableModules = this.getExtractableModules(this.minChunks, chunks);

        this.updateAvailableModulesUsage(extractableModules, chunks);

        let commonChunksCount = this.assignCommonIndexes(extractableModules);

        var commonChunks = this.addExtractedModulesToCommonChunks(compilation, chunks, extractableModules, commonChunksCount, true);

        var entryChunks = chunks.filter(chunk => {
          return !chunk.name.includes(this.commonChunkPrefix);
        });

        // connect used chunks with commonChunks
        this.makeCommonChunksTargetsOfEntryChunks(entryChunks, commonChunks);

        if (this.processOutput && typeof this.processOutput === 'function') {
          this.processOutput(entryChunks, commonChunks);
        }
      });
    });
  }
}

module.exports = MultiCommonChunksJS;