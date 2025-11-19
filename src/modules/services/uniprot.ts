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

  // 参考Chrome插件，使用gene_exact查询字段以避免HTTP 400错误
  let searchQuery = `gene_exact:${encodeURIComponent(query)} AND reviewed:true`;
  
  // 如果有物种编号，添加到查询中
  if (data.taxonomyId && data.taxonomyId.trim() !== "") {
    searchQuery += ` AND (taxonomy_id:${data.taxonomyId})`;
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
    
    // 如果有物种筛选但没有结果，尝试搜索所有物种
    if (data.taxonomyId && (!results || results.length === 0)) {
      getZtoolkit().log("No results for specific taxonomy, searching all species...");
      
      // 搜索所有物种（reviewed:true），使用gene_exact保持一致性
      const unknownSearchParams = new URLSearchParams(searchParams);
      const unknownQuery = `gene_exact:${encodeURIComponent(query)} AND reviewed:true`;
      unknownSearchParams.set('query', unknownQuery);
      const unknownUrl = `https://rest.uniprot.org/uniprotkb/search?${unknownSearchParams}`;
      
      try {
        const unknownXhr = await Zotero.HTTP.request("GET", unknownUrl, {
          headers: { 'Accept': 'application/json' },
          timeout: 15000,
          responseType: "json"
        });
        
        if (unknownXhr?.status === 200 && unknownXhr.response) {
          const unknownData = unknownXhr.response;
          let unknownResults = unknownData.results || [];
          
          // 如果reviewed:true没有结果，尝试reviewed:false
          if (unknownResults.length === 0) {
            const retrySearchParams = new URLSearchParams(unknownSearchParams);
            const retryQuery = `gene_exact:${encodeURIComponent(query)} AND reviewed:false`;
            retrySearchParams.set('query', retryQuery);
            const retryUrl = `https://rest.uniprot.org/uniprotkb/search?${retrySearchParams}`;
            
            const retryXhr = await Zotero.HTTP.request("GET", retryUrl, {
              headers: { 'Accept': 'application/json' },
              timeout: 15000,
              responseType: "json"
            });
            
            if (retryXhr?.status === 200 && retryXhr.response) {
              const retryData = retryXhr.response;
              if (retryData.results && retryData.results.length > 0) {
                unknownResults = retryData.results.slice(0, 10);
              }
            }
          }
          
          const noResultHtml = `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin-bottom: 15px; background: linear-gradient(135deg, #ffe6e6 0%, #ffcccc 100%); padding: 10px; border-radius: 10px; border: 1px solid #ffb3b3; box-shadow: 0 2px 4px rgba(0,0,0,0.05);"><p style="color: red; font-weight: bold;">该物种无该蛋白，正在搜索所有物种...</p></div>`;
          const resultHtml = await formatResultsAsHTML(unknownResults, query);
          data.result = noResultHtml + resultHtml;
          return;
        }
      } catch (retryError) {
        getZtoolkit().log("Retry search error:", retryError);
        // 继续使用原始结果
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

    // 使用HTML格式化结果，参考Chrome插件的格式
    data.result = await formatResultsAsHTML(results, query);
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
      
      return `
        <div style="margin-bottom: 10px; padding: 8px; border-left: 3px solid #ccc;">
          <div><strong>Accession:</strong> <a href="${url}" target="_blank">${accession}</a></div>
          <div><strong>Protein Name:</strong> ${proteinName}</div>
          <div><strong>Organism:</strong> ${organism}</div>
          ${description ? `<div><strong>Function:</strong> ${description}</div>` : ''}
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
      const pubmedRefs = match.replace(/[\(\)]/g, '');
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
        let locationText = locationComment.texts[0].value;
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

export const UniProt: TranslateService = {
  id: "uniprot",
  type: "word",
  name: "UniProt Search",
  helpUrl: "https://www.uniprot.org/help/uniprotkb",
  async translate(data) {
    return await searchUniProt(data);
  },
};