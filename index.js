const CommonsChunkPlugin = require('webpack/lib/optimize/CommonsChunkPlugin');

class MultiCommonChunksPlugin extends CommonsChunkPlugin {
  constructor(commonsChunkPluginParams, params) {
    super(commonsChunkPluginParams);

    this.commonChunkPrefix = 'multi_common_chunk_';
    this.processOutput = params.processOutput;
  }
  
  apply(compiler) {
    compiler.plugin('this-compilation', (compilation) => {
      compilation.plugin(['optimize-chunks'], (chunks) => {
        // only optimize once
				if(compilation[this.ident]) return;
        compilation[this.ident] = true;

        // TODO: Investigate here we don't pass targetChunk as in original
        // plugin, would it cause any problems later?
        const extractableModules = this.getExtractableModules(this.minChunks, chunks);

        this.updateAvailableModulesUsage(extractableModules, chunks);

        let commonChunksCount = this.assignCommonIndexes(extractableModules);

        let commonChunks = this.addExtractedModulesToCommonChunks(compilation, chunks, extractableModules, commonChunksCount);

        const entryChunks = chunks.filter(chunk => {
          return !chunk.name.includes(this.commonChunkPrefix);
        });

        // connect used chunks with commonChunks
        this.makeCommonChunksTargetsOfEntryChunks(entryChunks, commonChunks);

        if (this.processOutput && typeof this.processOutput === 'function') {
          this.processOutput(entryChunks, commonChunks);
        }

        return true;
      });
    });
  }

  updateAvailableModulesUsage(modules, chunks) {
    for (const modIndex in modules) {
      let mod = modules[modIndex];
      mod.multiCommonChunksUsedBy = [];

      chunks.forEach(chunk => {
        if (chunk.modulesIterable.has(mod)) {
          mod.multiCommonChunksUsedBy.push(chunk.name);
        }
        /*
        // removeChunk returns true if the chunk was contained and succesfully removed
				// false if the module did not have a connection to the chunk in question
        if(mod.removeChunk(chunk)) {
          mod.multiCommonChunksUsedBy.push(chunk.name);
        }
        */
      })

    }
  }

  assignCommonIndexes(modules) {
    var index = 0,
        commonModulesIndex = {};

    modules.forEach(mod => {
      let modKey = mod.multiCommonChunksUsedBy.join('_');

      if (mod.multiCommonChunksUsedBy.length === 1) return;


      if (!commonModulesIndex.hasOwnProperty(modKey)) {
        mod.multiCommonChunkId = index;

        // add list of required commonChunks to entryChunks
        mod.chunks.forEach(function(chunk) {
          mod.removeChunk(chunk);

          if (!chunk.multiCommonChunksRequired) {
            chunk.multiCommonChunksRequired = [];
          }
          chunk.multiCommonChunksRequired.push(index);
        });

        commonModulesIndex[modKey] = index++;
      } else {
        mod.multiCommonChunkId = commonModulesIndex[modKey];
      }
    });

    // return common chunks count
    return index;
  }

  addExtractedModulesToCommonChunks(compilation, chunks, modules, commonChunksCount) {
    var commonChunks = [];

    // modules (Array) -> jquery, commonn, ...
    // chunks (Array) -> files from entries

    // create chunks for common modules
    for (let i = 0; i < commonChunksCount; i++) {
      commonChunks.push(compilation.addChunk(`${this.commonChunkPrefix}${i}`));
    }

    modules.forEach(module => {
      let chunk = commonChunks[module.multiCommonChunkId];

      chunk.addModule(module);
      module.addChunk(chunk);
    });

    return commonChunks;
  }

  makeCommonChunksTargetsOfEntryChunks(chunks, commonChunks) {
    chunks.forEach(chunk => {
      chunk.multiCommonChunksRequired.forEach(requiredCommmonChunkIndex => {
        var commonChunk = commonChunks[requiredCommmonChunkIndex];

        // set commonChunk as new sole parent
        chunk.parents = [commonChunk];
        
        // add chunk to commonChunk
        commonChunk.addChunk(chunk);

        for(const entrypoint of chunk.entrypoints) {
          entrypoint.insertChunk(commonChunk, chunk);
        }
      });
    });
  }
}

module.exports = MultiCommonChunksPlugin;