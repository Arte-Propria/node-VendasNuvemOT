import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Função para buscar dados do ADS
export const fetchDataADSMeta = async ({ store, createdAtMin, createdAtMax }) => {
  let accountID;
  let accessToken = process.env.META_ACCESS_TOKEN;
  
  if (store === "outlet") {
    accountID = process.env.META_ID_ACCOUNT_OUTLET;
  }
  if (store === "artepropria") {
    accountID = process.env.META_ID_ACCOUNT_ARTEPROPRIA;
  }

  const campaignsUrl = `https://graph.facebook.com/v19.0/act_${accountID}/campaigns`;

  const campaignParams = {
    fields: 'id,name',
    access_token: accessToken,
    limit: 100,
  };

  try {
    const campaignsResponse = await axios.get(campaignsUrl, { params: campaignParams });
    let campaigns = campaignsResponse.data.data;

    // Busca insights para cada campanha
    const insightsPromises = campaigns.map(async (campaign) => {
      const insightsUrl = `https://graph.facebook.com/v19.0/${campaign.id}/insights`;
      const params = {
        time_range: `{"since":"${createdAtMin}","until":"${createdAtMax}"}`,
        access_token: accessToken,
        fields: 'spend,account_id,impressions',
      };

      const insightsResponse = await axios.get(insightsUrl, { params });
      return { campaignName: campaign.name, insights: insightsResponse.data.data };
    });

    const insightsArray = await Promise.all(insightsPromises);
    
    // Soma o gasto total, o gasto em campanhas ECOM e as impressões
    let totalSpend = 0;
    let totalSpendEcom = 0;
    let totalImpressions = 0;
    let account_id = accountID;

    insightsArray.forEach(({ campaignName, insights }) => {
      insights.forEach(insight => {
        const spend = parseFloat(insight.spend);
        const impressions = parseInt(insight.impressions, 10);

        totalSpend += spend;
        totalImpressions += impressions;

        if (campaignName.includes("ECOM")) {
          totalSpendEcom += spend;
        }

        account_id = insight.account_id;
      });
    });

    const result = [{
      account_id,
      spend: totalSpend.toFixed(2),
      spendEcom: totalSpendEcom.toFixed(2),
      impressions: totalImpressions
    }];

    return result;
    
  } catch (error) {
    console.error('Error fetching data ADS:', error);
    throw error;
  }
};
