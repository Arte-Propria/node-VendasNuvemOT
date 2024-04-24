import axios from 'axios'
import dotenv from 'dotenv';

dotenv.config();

// Função para buscar dados do ADS
export const fetchDataADSMeta = async ({ store, createdAtMin, createdAtMax }) => {
	let accountID
  let accessToken = process.env.META_ACCESS_TOKEN 
  
  if(store === "outlet"){
		accountID = process.env.META_ID_ACCOUNT_OUTLET
	}
	if(store === "artepropria"){
		accountID = process.env.META_ID_ACCOUNT_ARTEPROPRIA
	}

  const url = `https://graph.facebook.com/v19.0/act_${accountID}/insights`;
  
  const params = {
    time_increment: 7,
    time_range: `{"since":"${createdAtMin}","until":"${createdAtMax}"}`,
    access_token: accessToken
  };

  try {
    const response = await axios.get(url, { params });

    return response.data.data
    
  } catch (error) {
    console.error('Error fetching data ADS:', error);
    throw error;
  }

};
