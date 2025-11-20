import { TranslateTask } from "../../utils/task";
import { TranslateService } from "./base";
import { config } from "../../../package.json";

// 延迟获取插件实例和工具包
function getAddon() {
  // @ts-ignore - Plugin instance is not typed
  return Zotero[config.addonInstance];
}

function getZtoolkit() {
  return getAddon().data.ztoolkit;
}

interface UniProtSearchResult {
  id: string;
  proteinName: string;
  description: string;
  organism: string;
  url: string;
}

async function searchUniProt(data: Required<TranslateTask>) {
  const query = data.raw.trim();
  
  if (!query) {
    throw new Error("Please enter a search term");
  }

  // 使用gene字段进行模糊匹配，而不是gene_exact，以获取更多相关结果
  let searchQuery = `gene:${encodeURIComponent(query)} AND reviewed:true`;
  
  // 如果有物种编号，添加到查询中
  if (data.taxonomyId && data.taxonomyId.trim() !== "") {
    searchQuery += ` AND (taxonomy_id:${data.taxonomyId})`;
    getZtoolkit().log("UniProt search with taxonomyId:", data.taxonomyId);
  } else {
    getZtoolkit().log("UniProt search without taxonomyId");
  }

  // 使用URLSearchParams构建URL，参考Chrome插件的参数设置
  const searchParams = new URLSearchParams({
    query: searchQuery,
    fields: [
      "accession",
      "protein_name", 
      "cc_function",
      "organism_name",
      "xref_biogrid",
      "xref_flybase", 
      "cc_subcellular_location",
      "xref_refseq",
      "xref_string"
    ].join(","),
    sort: "accession desc",  // 匹配Chrome插件的排序方式
    includeIsoform: "false",
    size: "10"  // 移除format参数，这在API中是隐含的
  });
  
  const searchUrl = `https://rest.uniprot.org/uniprotkb/search?${searchParams}`;

  try {
    // 添加调试日志
    getZtoolkit().log("UniProt search URL:", searchUrl);
    
    const xhr = await Zotero.HTTP.request(
      "GET",
      searchUrl,
      {
        headers: {
          'Accept': 'application/json'
        },
        timeout: 15000,
        responseType: "json"  // 使用json，Zotero会自动解析JSON响应
      }
    );

    getZtoolkit().log("UniProt response status:", xhr?.status);
    getZtoolkit().log("UniProt response type:", typeof xhr?.response);

    if (xhr?.status !== 200) {
      throw `Request error: ${xhr?.status}`;
    }

    // 检查响应是否存在且有效
    if (!xhr.response) {
      throw "Empty response from UniProt API";
    }

    // 响应已经是解析后的JSON对象
    const responseData = xhr.response;
    getZtoolkit().log("UniProt API response structure:", responseData);

    // 检查响应是否有results字段
    if (!responseData.results) {
      // 尝试直接使用响应作为结果（如果API结构发生变化）
      const results = Array.isArray(responseData) ? responseData : [];
      data.result = await formatResultsAsHTML(results, query);
      return;
    }

    // 参考Chrome插件的重试逻辑
    const results = responseData.results;
    
    // 如果有物种筛选但没有结果，强制搜索该物种的所有相关gene（包括reviewed:false）
    if (data.taxonomyId && (!results || results.length === 0)) {
      getZtoolkit().log("No reviewed results for specific taxonomy, forcing search for same species with reviewed:false...");
      
      // 强制搜索该物种的reviewed:false结果，不搜索其他物种
      const sameSpeciesSearchParams = new URLSearchParams(searchParams);
      const sameSpeciesQuery = `gene:${encodeURIComponent(query)} AND reviewed:false AND (taxonomy_id:${data.taxonomyId})`;
      sameSpeciesSearchParams.set('query', sameSpeciesQuery);
      sameSpeciesSearchParams.set('size', '5'); // 只显示前5条结果
      const sameSpeciesUrl = `https://rest.uniprot.org/uniprotkb/search?${sameSpeciesSearchParams}`;
      
      try {
        const sameSpeciesXhr = await Zotero.HTTP.request("GET", sameSpeciesUrl, {
          headers: { 'Accept': 'application/json' },
          timeout: 15000,
          responseType: "json"
        });
        
        if (sameSpeciesXhr?.status === 200 && sameSpeciesXhr.response) {
          const sameSpeciesData = sameSpeciesXhr.response;
          const sameSpeciesResults = sameSpeciesData.results || [];
          
          if (sameSpeciesResults.length > 0) {
            getZtoolkit().log("Found unreviewed results for same species");
            const noResultHtml = `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin-bottom: 15px; background: linear-gradient(135deg, #fff9e6 0%, #ffebcc 100%); padding: 10px; border-radius: 10px; border: 1px solid #ffd699; box-shadow: 0 2px 4px rgba(0,0,0,0.05);"><p style="color: #cc7a00; font-weight: bold;">该物种无reviewed蛋白，显示unreviewed结果...</p></div>`;
            const resultHtml = await formatResultsAsHTML(sameSpeciesResults, query);
            data.result = noResultHtml + resultHtml;
            return;
          } else {
            // 如果该物种连unreviewed结果都没有，显示无结果信息
            const noResultHtml = `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin-bottom: 15px; background: linear-gradient(135deg, #ffe6e6 0%, #ffcccc 100%); padding: 10px; border-radius: 10px; border: 1px solid #ffb3b3; box-shadow: 0 2px 4px rgba(0,0,0,0.05);"><p style="color: red; font-weight: bold;">该物种无该蛋白的任何搜索结果</p></div>`;
            data.result = noResultHtml;
            return;
          }
        }
      } catch (sameSpeciesError) {
        getZtoolkit().log("Same species unreviewed search error:", sameSpeciesError);
        // 显示错误信息
        const errorHtml = `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin-bottom: 15px; background: linear-gradient(135deg, #ffe6e6 0%, #ffcccc 100%); padding: 10px; border-radius: 10px; border: 1px solid #ffb3b3; box-shadow: 0 2px 4px rgba(0,0,0,0.05);"><p style="color: red; font-weight: bold;">搜索该物种时发生错误</p></div>`;
        data.result = errorHtml;
        return;
      }
    }

    // 如果没有物种筛选但没有结果，尝试reviewed:false
    if (!data.taxonomyId && (!results || results.length === 0)) {
      getZtoolkit().log("No results for reviewed:true, trying reviewed:false...");
      
      const retrySearchParams = new URLSearchParams(searchParams);
      const retryQuery = `gene:${encodeURIComponent(query)} AND reviewed:false`;
      retrySearchParams.set('query', retryQuery);
      const retryUrl = `https://rest.uniprot.org/uniprotkb/search?${retrySearchParams}`;
      
      try {
        const retryXhr = await Zotero.HTTP.request("GET", retryUrl, {
          headers: { 'Accept': 'application/json' },
          timeout: 15000,
          responseType: "json"
        });
        
        if (retryXhr?.status === 200 && retryXhr.response) {
          const retryData = retryXhr.response;
           const retryResults = retryData.results || [];
           data.result = await formatResultsAsHTML(retryResults, query);
           return;
        }
      } catch (retryError) {
        getZtoolkit().log("Retry search error:", retryError);
        // 继续使用原始结果
      }
    }

    // 根据物种选项优化结果显示逻辑
    let optimizedResults;
    
    // 如果选择了具体物种，强制只显示该物种的结果
    if (data.taxonomyId && data.taxonomyId.trim() !== '') {
      // 过滤出只属于该物种的结果（使用organism名称匹配）
      const targetSpeciesResults = results.filter((result: any) => {
        if (!result.organism || !result.organism.scientificName) {
          return false;
        }
        
        // 根据taxonomyId映射到对应的物种名称
        const speciesMap: {[key: string]: string} = {
          '9606': 'Homo sapiens',
          '10090': 'Mus musculus', 
          '10116': 'Rattus norvegicus',
          '7227': 'Drosophila melanogaster',
          '6239': 'Caenorhabditis elegans'
        };
        
        const targetSpeciesName = speciesMap[data.taxonomyId];
        return result.organism.scientificName === targetSpeciesName;
      });
      
      getZtoolkit().log("Forcing display of only target species results:", targetSpeciesResults.length);
      optimizedResults = targetSpeciesResults;
    } else {
      // All模式下使用原有的优化逻辑
      optimizedResults = optimizeResultsDisplay(results, data.taxonomyId);
    }
    
    // 使用HTML格式化优化后的结果
    data.result = await formatResultsAsHTML(optimizedResults, query);
  } catch (error) {
    getZtoolkit().log("UniProt search error:", error);
    throw error;
  }
}

function parseUniProtResults(data: any): UniProtSearchResult[] {
  if (!data.results || !Array.isArray(data.results)) {
    return [];
  }

  return data.results.map((item: any) => {
    const proteinName = extractProteinName(item);
    const description = extractDescription(item);
    const organism = extractOrganism(item);
    
    return {
      id: item.primaryAccession || '',
      proteinName,
      description,
      organism,
      url: `https://www.uniprot.org/uniprot/${item.primaryAccession || ''}`
    };
  });
}

// 参考Chrome插件的HTML格式化方式
async function formatResultsAsHTML(results: any[], query: string): Promise<string> {
    if (results.length === 0) {
     return 'No UniProt results found';
    }
  
    // 保留重要信息和超链接，同时保持简洁格式
    return results.map((result, index) => {
      const proteinName = extractProteinName(result);
      const organism = extractOrganism(result);
      const accession = result.primaryAccession || '';
      const description = extractDescription(result);
      const url = `https://www.uniprot.org/uniprot/${accession}`;
      
      // 提取额外的数据库信息
      const refSeqInfo = extractRefSeqInfo(result);
      const stringId = extractStringId(result);
      const subcellularLocation = extractSubcellularLocation(result);
      const { bioGridIdLink, flyBaseIdLink } = extractDatabaseLinks(result);
      
      // 调试日志：检查数据库链接信息
      getZtoolkit().log(`结果 ${index + 1} - BioGRID: ${bioGridIdLink}, FlyBase: ${flyBaseIdLink}`);
      
      // 为不同结果添加不同的边框颜色，增强区分度
      const borderColors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336'];
      const borderColor = borderColors[index % borderColors.length];
      
      // 参考Chrome插件的布局：使用flex布局显示数据库链接
      return `
        <div style="
          margin-bottom: 15px; 
          padding: 12px; 
          border-left: 4px solid ${borderColor};
          background: #f9f9f9;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        ">
          <div style="margin-bottom: 8px;">
            <strong>Accession:</strong> <a href="${url}" target="_blank" style="color: #1976d2; text-decoration: none;">${accession}</a>
          </div>
          <div style="margin-bottom: 6px;"><strong>Protein Name:</strong> ${proteinName}</div>
          <div style="margin-bottom: 6px;"><strong>Organism:</strong> ${organism}</div>
          ${description ? `<div style="margin-bottom: 8px;"><strong>Function:</strong> ${description}</div>` : ''}
          
          <!-- 数据库信息区域 - 参考Chrome插件的flex布局 -->
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
            <div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
              ${bioGridIdLink !== '无' ? `<div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;"><strong>BioGRID:</strong> ${bioGridIdLink}</div>` : ''}
              ${flyBaseIdLink !== '无' ? `<div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;"><strong>FlyBase:</strong> ${flyBaseIdLink}</div>` : ''}
              ${stringId !== '无' ? `<div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;"><strong>STRING:</strong> ${stringId}</div>` : ''}
            </div>
            <div style="font-size: 11px; color: #666;">
              ${refSeqInfo !== '无RefSeq信息' ? `<div><strong>RefSeq:</strong> ${refSeqInfo}</div>` : ''}
              ${subcellularLocation !== '无细胞定位信息' ? `<div><strong>Subcellular Location:</strong> ${subcellularLocation}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

function extractProteinName(item: any): string {
  if (item.proteinDescription && item.proteinDescription.recommendedName) {
    return item.proteinDescription.recommendedName.fullName.value || '';
  }
  
  if (item.proteinDescription && item.proteinDescription.submissionNames && item.proteinDescription.submissionNames.length > 0) {
    return item.proteinDescription.submissionNames[0].fullName.value || '';
  }
  
  return 'Unknown Protein';
}

function extractDescription(item: any): string {
  let functionText = '';
  
  // 使用cc_function字段获取功能描述
  if (item.comments && Array.isArray(item.comments)) {
    const functionComment = item.comments.find((comment: any) => comment.commentType === 'FUNCTION');
    if (functionComment && functionComment.texts && functionComment.texts.length > 0) {
      functionText = functionComment.texts[0].value || '';
    }
  }
  
  // 如果comments中没有，尝试从cc_function字段获取
  if (!functionText && item.cc_function && Array.isArray(item.cc_function)) {
    functionText = item.cc_function.map((func: any) => func.value || '').join('; ') || '';
  }
  
  // 参考Chrome插件的处理逻辑：提取PubMed链接并格式化
  if (functionText) {
    // 提取PubMed引用并格式化链接
    functionText = functionText.replace(/\(PubMed:\d+(?:,\s*PubMed:\d+)*\)/g, function(match) {
      const pubmedRefs = match.replace(/[()]/g, '');
      const ids = pubmedRefs.split(/,\s*/).map((ref: string) => ref.replace('PubMed:', ''));
      return '(' + ids.map((id: string) => `<a href="https://pubmed.ncbi.nlm.nih.gov/${id}/" target="_blank">PubMed:${id}</a>`).join(', ') + ')';
    });
    
    // 将文本转换为列表格式，参考Chrome插件的显示方式
    const sentences = functionText.split('.').map(s => s.trim()).filter(s => s);
    if (sentences.length > 0) {
      // 去重处理
      const uniqueSentences: string[] = [];
      const seen = new Set<string>();
      
      sentences.forEach(sentence => {
        const coreContent = sentence.replace(/\(PubMed:\d+(?:,\s*PubMed:\d+)*\)/g, '').trim();
        if (!seen.has(coreContent)) {
          seen.add(coreContent);
          uniqueSentences.push(sentence);
        }
      });
      
      // 取最长的5个句子
      const longestSentences = [...uniqueSentences]
        .sort((a, b) => b.length - a.length)
        .slice(0, 5);
      
      if (longestSentences.length > 0) {
        return `<ul style="margin: 0; padding-left: 20px;">${longestSentences.map(text => `<li>${text}.</li>`).join('')}</ul>`;
      }
    }
  }
  
  return '无功能注释';
}

function extractOrganism(item: any): string {
  if (item.organism && item.organism.scientificName) {
    return item.organism.scientificName;
  }
  
  return 'Unknown organism';
}

// 提取RefSeq信息，参考Chrome插件的实现
function extractRefSeqInfo(item: any): string {
  let refSeqInfo = [];

  if (item.uniProtKBCrossReferences && Array.isArray(item.uniProtKBCrossReferences)) {
    const refSeqEntries = item.uniProtKBCrossReferences.filter((ref: any) => ref.database === 'RefSeq');

    if (refSeqEntries.length > 0) {
      refSeqInfo = refSeqEntries.map((entry: any) => {
        const refSeqData = {
          id: entry.id || '无',
          nucleotideSequenceId: '无'
        };

        if (entry.properties && Array.isArray(entry.properties)) {
          const nucleotideProp = entry.properties.find((prop: any) => prop.key === 'NucleotideSequenceId');
          if (nucleotideProp) {
            refSeqData.nucleotideSequenceId = nucleotideProp.value;
          }
        }

        return refSeqData;
      });
    }
  }

  // 格式化RefSeq信息为HTML
  if (refSeqInfo.length > 0) {
    return refSeqInfo.map((item: any) => {
      const idPart = item.id !== '无' ? `<a href="https://www.ncbi.nlm.nih.gov/protein/${item.id}" target="_blank">${item.id}</a>` : '无';
      const nucleotidePart = item.nucleotideSequenceId !== '无' ? `<a href="https://www.ncbi.nlm.nih.gov/nuccore/${item.nucleotideSequenceId}" target="_blank">${item.nucleotideSequenceId}</a>` : '无';
      return `${idPart}, ${nucleotidePart}`;
    }).join('<br>');
  }

  return '无RefSeq信息';
}

// 提取STRING ID，参考Chrome插件的实现
function extractStringId(item: any): string {
  if (item.uniProtKBCrossReferences && Array.isArray(item.uniProtKBCrossReferences)) {
    const stringEntry = item.uniProtKBCrossReferences.find((ref: any) => ref.database === 'STRING');
    if (stringEntry && stringEntry.id) {
      return `<a href="javascript:void(0)" class="string-id-link" data-string-id="${encodeURIComponent(stringEntry.id)}">${stringEntry.id}</a>`;
    }
  }
  return '无';
}

// 提取细胞定位信息，参考Chrome插件的实现
function extractSubcellularLocation(item: any): string {
  let subcellularLocation = '无细胞定位信息';
  const locationMap = new Map();

  // 从comments中提取
  if (item.comments && Array.isArray(item.comments)) {
    const locationComment = item.comments.find((comment: any) => comment.commentType === 'SUBCELLULAR LOCATION');

    if (locationComment) {
      if (locationComment.subcellularLocations && Array.isArray(locationComment.subcellularLocations)) {
        locationComment.subcellularLocations.forEach((locItem: any) => {
          const location = locItem.location.value.trim();
          const normalizedLocation = location.replace(/[^\w\s]/g, '').toLowerCase();
          if (!locationMap.has(normalizedLocation)) {
            locationMap.set(normalizedLocation, location);
          }
        });

        const uniqueLocations = Array.from(locationMap.values());
        subcellularLocation = uniqueLocations.join('、');
      } else if (locationComment.texts && Array.isArray(locationComment.texts)) {
        const locationText = locationComment.texts[0].value;
        const locationMatch = locationText.match(/(?:Predominantly|Mainly|Localized to|Located in|Found in)\s+([\w\s]+)/i);
        if (locationMatch && locationMatch[1]) {
          subcellularLocation = locationMatch[1].trim();
        } else {
          subcellularLocation = locationText.trim();
        }
      }
    }
  }

  // 从cc_subcellular_location字段提取
  if (subcellularLocation === '无细胞定位信息' && item.cc_subcellular_location && Array.isArray(item.cc_subcellular_location)) {
    const locations = item.cc_subcellular_location.map((loc: any) => loc.location?.value || '').filter(Boolean);
    if (locations.length > 0) {
      subcellularLocation = [...new Set(locations)].join('、');
    }
  }

  return subcellularLocation;
}

// 提取BioGRID和FlyBase信息
function extractDatabaseLinks(item: any): { bioGridIdLink: string; flyBaseIdLink: string } {
  let bioGridIdLink = '无';
  let flyBaseIdLink = '无';

  if (item.uniProtKBCrossReferences && Array.isArray(item.uniProtKBCrossReferences)) {
    const bioGridRef = item.uniProtKBCrossReferences.find((ref: any) => ref.database === 'BioGRID');
    if (bioGridRef && bioGridRef.id) {
      bioGridIdLink = `<a href="https://thebiogrid.org/${bioGridRef.id}" target="_blank">${bioGridRef.id}</a>`;
    }

    const flyBaseRef = item.uniProtKBCrossReferences.find((ref: any) => ref.database === 'FlyBase');
    if (flyBaseRef && flyBaseRef.id) {
      flyBaseIdLink = `<a href="https://flybase.org/reports/${flyBaseRef.id}" target="_blank">${flyBaseRef.id}</a>`;
    }
  }

  return { bioGridIdLink, flyBaseIdLink };
}

// 优化结果显示逻辑
function optimizeResultsDisplay(results: any[], taxonomyId: string): any[] {
  if (!results || results.length === 0) {
    return results;
  }

  // 添加调试日志
  getZtoolkit().log("优化结果显示逻辑 - taxonomyId:", taxonomyId, "结果数量:", results.length);

  // 如果选择了特定物种，优先显示该物种的结果
  if (taxonomyId && taxonomyId.trim() !== '') {
    // 分离当前物种的结果和其他物种的结果
    const targetSpeciesResults: any[] = [];
    const otherSpeciesResults: any[] = [];

    results.forEach(result => {
      // 检查结果是否属于目标物种（使用organism名称匹配）
      if (!result.organism || !result.organism.scientificName) {
        otherSpeciesResults.push(result);
      } else {
        // 根据taxonomyId映射到对应的物种名称
        const speciesMap: {[key: string]: string} = {
          '9606': 'Homo sapiens',
          '10090': 'Mus musculus', 
          '10116': 'Rattus norvegicus',
          '7227': 'Drosophila melanogaster',
          '6239': 'Caenorhabditis elegans'
        };
        
        const targetSpeciesName = speciesMap[taxonomyId];
        if (result.organism.scientificName === targetSpeciesName) {
          targetSpeciesResults.push(result);
        } else {
          otherSpeciesResults.push(result);
        }
      }
    });

    getZtoolkit().log("物种筛选结果 - 目标物种:", targetSpeciesResults.length, "其他物种:", otherSpeciesResults.length);

    // 优先显示目标物种的结果
    return [...targetSpeciesResults, ...otherSpeciesResults];
  }
  
  // All模式下，根据可信度排序
  else {
    // 根据reviewed状态和证据级别排序
    const sortedResults = [...results].sort((a, b) => {
      // 优先显示reviewed的结果
      if (a.reviewed !== b.reviewed) {
        return a.reviewed ? -1 : 1;
      }
      
      // 其次根据证据级别排序（如果有的话）
      const aEvidence = getEvidenceLevel(a);
      const bEvidence = getEvidenceLevel(b);
      
      if (aEvidence !== bEvidence) {
        return bEvidence - aEvidence;
      }
      
      // 最后根据注释数量排序
      const aAnnotations = getAnnotationCount(a);
      const bAnnotations = getAnnotationCount(b);
      
      return bAnnotations - aAnnotations;
    });

    getZtoolkit().log("All模式排序结果 - 前5条结果:", sortedResults.slice(0, 5).map(r => r.primaryAccession));
    
    return sortedResults;
  }
}

// 获取证据级别（数值越大表示可信度越高）
function getEvidenceLevel(item: any): number {
  // 根据proteinExistence级别排序
  // 1: Evidence at protein level
  // 2: Evidence at transcript level  
  // 3: Inferred from homology
  // 4: Predicted
  // 5: Uncertain
  
  if (item.proteinExistence) {
    switch (item.proteinExistence) {
      case "1: Evidence at protein level": return 5;
      case "2: Evidence at transcript level": return 4;
      case "3: Inferred from homology": return 3;
      case "4: Predicted": return 2;
      case "5: Uncertain": return 1;
      default: return 0;
    }
  }
  
  return 0;
}

// 获取注释数量
function getAnnotationCount(item: any): number {
  let count = 0;
  
  // 计算功能注释
  if (item.comments && Array.isArray(item.comments)) {
    count += item.comments.length;
  }
  
  // 计算交叉引用
  if (item.uniProtKBCrossReferences && Array.isArray(item.uniProtKBCrossReferences)) {
    count += item.uniProtKBCrossReferences.length;
  }
  
  // 计算关键词
  if (item.keywords && Array.isArray(item.keywords)) {
    count += item.keywords.length;
  }
  
  return count;
}

export const UniProt: TranslateService = {
  id: "uniprot",
  type: "word",
  name: "UniProt Search",
  helpUrl: "https://www.uniprot.org/help/uniprotkb",
  async translate(data) {
    return await searchUniProt(data);
  },
};