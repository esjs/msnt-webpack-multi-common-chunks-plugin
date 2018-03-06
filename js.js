const MultiCommonChunksBase = require('./index');

class MultiCommonChunksJS extends MultiCommonChunksBase {
  apply(compiler) {
    var entryChunks,
        commonChunks;

    const extension = this.extension = 'js';

    compiler.plugin('this-compilation', (compilation) => {

      compilation.plugin(['optimize-chunks'], (chunks) => {
        // only optimize once
        if(compilation[this.ident]) return;
        compilation[this.ident] = true;

        const affectedChunks = this.getAffectedChunks(
          compilation,
          chunks,
          {parents: []}, // fake target chunk to 
          [], // fake targetChunks
          0, // index of current targetChunk
          null, // selectedChunks
          false, // async
          this.children
        );

        const extractableModules = this.getExtractableModules(this.minChunks, affectedChunks);

        this.updateAvailableModulesUsage(extractableModules, affectedChunks);

        const commonChunksCount = this.assignCommonIndexes(extractableModules);

        this.removeExtractedModules(affectedChunks);

        commonChunks = this.createCommonChunks(extractableModules, commonChunksCount);

        entryChunks = affectedChunks.filter(chunk => {
          return !chunk.name.includes(this.commonChunkPrefix);
        });

        if (this.minSize) {
          commonChunks = this.mergeSmallCommonChunks(commonChunks, entryChunks);
        }

        // add chunks to compilation manually, we cannot use addModule method here
        // because it creates chunk and we need to add existing one
        commonChunks.forEach(chunk => {
          compilation.chunks.push(chunk);
        });

        // connect used chunks with commonChunks
        this.makeCommonChunksTargetsOfEntryChunks(entryChunks, commonChunks);
      });

      compilation.plugin("additional-assets", callback => {
        callback();
        
        if (this.processOutput && typeof this.processOutput === 'function') {
          this.processOutput(entryChunks, commonChunks);
        }
      });
    });
  }

  makeCommonChunksTargetsOfEntryChunks(entryChunks, commonChunks) {
    entryChunks.forEach(chunk => {
      if (!chunk.multiCommonChunksRequired) return;

      chunk.multiCommonChunksRequired.forEach(commonChunkIndex => {
        // var commonChunk = commonChunks[commonChunkIndex];
        var targetCommonChunk;

        commonChunks.forEach(commonChunk => {
          if (
            commonChunk.multiCommonChunkIndex !== commonChunkIndex
          ) return;

          targetCommonChunk = commonChunk;
        });

        // set targetCommonChunk as new sole parent
        chunk.parents = [targetCommonChunk];
        
        // add chunk to targetCommonChunk
        targetCommonChunk.addChunk(chunk);

        for(const entrypoint of chunk.entrypoints) {
          entrypoint.insertChunk(targetCommonChunk, chunk);
        }
      });
    });
  }
}

module.exports = MultiCommonChunksJS;