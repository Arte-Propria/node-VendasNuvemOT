import { createCoupon, fetchCoupons } from "../services/couponServices.js"

export const getCoupons = async (req, res) => {
	try {
		const params = req.params
		const coupons = await fetchCoupons(params)
		res.json(coupons)
	} catch (error) {
		console.error(error)
		res.status(500).send("Erro ao buscar coupons")
	}
}

export const postCoupon = async (req, res) => {
  const params = req.params;
	const nameClient = params.code.toUpperCase();
	const codeCoupon = `${nameClient}-5`;

  try {
    // Cria o cupom
    const coupon = await createCoupon(params, codeCoupon);
    
    // Retorna o código do cupom se criado com sucesso
		console.log("Cupom criado!:", coupon.code)
    return res.json({code: coupon.code});
  } catch (error) {
    // Verifica se o erro é devido ao cupom já existir
    if (error.response && error.response.status === 422) {

      console.error("Cupom já existente:", codeCoupon);

      // Retorna o código do cupom existente ao cliente
      return res.status(201).json({ code: codeCoupon });
    }

    // Caso contrário, retorna o erro original
    return res.status(500).json({ code: codeCoupon, error: "Erro ao criar o cupom" });
  }
};
