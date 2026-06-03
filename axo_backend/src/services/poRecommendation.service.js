/**
 * Service for calculating quote recommendations
 * Helps OEMs select best supplier based on multiple criteria
 * Aligned with PRD: Quote Acceptance & Supplier Selection
 */

// ==================== CONSTANTS ====================

const RECOMMENDATION_LEVELS = {
    HIGHLY_RECOMMENDED: 'HIGHLY_RECOMMENDED',
    RECOMMENDED: 'RECOMMENDED',
    STANDARD: 'STANDARD',
    NOT_RECOMMENDED: 'NOT_RECOMMENDED'
};

const RECOMMENDATION_TAGS = {
    BEST_PRICE: 'BEST_PRICE',
    FASTEST_DELIVERY: 'FASTEST_DELIVERY',
    BEST_QUALITY: 'BEST_QUALITY',
    HIGHEST_RATED: 'HIGHEST_RATED',
    TRUSTED_SUPPLIER: 'TRUSTED_SUPPLIER',
    PPAP_COMPLIANT: 'PPAP_COMPLIANT',
    PREVIOUS_PARTNER: 'PREVIOUS_PARTNER'
};

// Weight configuration (can be adjusted based on business rules)
const SCORING_WEIGHTS = {
    PRICE: 0.35,           // 35% - Cost consideration
    DELIVERY: 0.25,        // 25% - Lead time
    QUALITY: 0.20,         // 20% - Quality metrics (PRD emphasis)
    SUPPLIER_RATING: 0.15, // 15% - Historical performance
    COMPLIANCE: 0.05       // 5%  - Certifications, PPAP level
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculates quality score based on supplier metrics
 * Aligned with PRD: Quality Documents, Certifications (Page 5-6)
 */
const calculateQualityScore = (quote) => {
    let qualityScore = 1.0; // Base score
    
    // Check for quality certifications
    const certifications = quote.supplier_certifications || [];
    if (certifications.includes('ISO9001')) qualityScore += 0.05;
    if (certifications.includes('IATF16949')) qualityScore += 0.08;
    if (certifications.includes('AS9100')) qualityScore += 0.10;
    
    // PPAP Level compliance (higher is better for quality)
    const ppapLevel = quote.ppap_level || 'Level 1';
    const ppapScores = { 'Level 1': 1.0, 'Level 2': 1.1, 'Level 3': 1.2 };
    qualityScore *= (ppapScores[ppapLevel] || 1.0);
    
    // Quality document upload check
    if (quote.has_quality_docs) qualityScore += 0.05;
    if (quote.has_certifications) qualityScore += 0.05;
    
    return Math.min(qualityScore, 1.5); // Cap at 1.5
};

/**
 * Calculates supplier rating based on historical performance
 * Aligned with PRD Phase 3: Supplier performance scorecards
 */
const calculateSupplierRating = async (supplierId, dbClient = null) => {
    // If no DB client, return default rating
    if (!dbClient || !supplierId) {
        return 1.0;
    }
    
    try {
        // Check if table exists first
        const tableCheck = await dbClient.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_name = 'supplier_performance'
            )
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('supplier_performance table does not exist yet');
            return 1.0;
        }
        
        // Fetch historical performance metrics
        const result = await dbClient.query(`
            SELECT 
                COALESCE(AVG(on_time_delivery_rate), 0) as on_time_rate,
                COALESCE(AVG(quality_rating), 0) as quality_rating,
                COALESCE(COUNT(CASE WHEN order_id IS NOT NULL THEN 1 END), 0) as completed_orders,
                COALESCE(AVG(communication_rating), 0) as communication_rating
            FROM supplier_performance
            WHERE supplier_id = $1
        `, [supplierId]);
        
        const metrics = result.rows[0];
        
        if (metrics.completed_orders === 0) {
            return 1.0; // New supplier, neutral rating
        }
        
        // Calculate weighted rating
        const rating = (
            (metrics.on_time_rate * 0.4) +
            (metrics.quality_rating * 0.4) +
            (metrics.communication_rating * 0.2)
        ) / 100; // Normalize to 0-1 scale
        
        return Math.min(Math.max(rating, 0.5), 1.5);
        
    } catch (error) {
        console.error('Error calculating supplier rating:', error);
        return 1.0;
    }
};

/**
 * Normalizes price considering currency differences
 */
const normalizePrice = (price, currency, targetCurrency = 'USD') => {
    // Exchange rates (simplified - should use real-time rates in production)
    const exchangeRates = {
        'USD': 1.0,
        'EUR': 1.08,
        'GBP': 1.25,
        'INR': 0.012,
        'CNY': 0.14
    };
    
    const rate = exchangeRates[currency] || 1.0;
    const targetRate = exchangeRates[targetCurrency] || 1.0;
    
    return (price * rate) / targetRate;
};

/**
 * Calculates bulk discount adjusted price
 */
const calculateBulkAdjustedPrice = (quote, rfqQuantity) => {
    const basePrice = Number(quote.price || 0);
    const quoteQuantity = Number(quote.quantity || rfqQuantity);
    
    // If quoting same quantity as RFQ, no adjustment
    if (quoteQuantity >= rfqQuantity) {
        return basePrice;
    }
    
    // Apply volume discount (simplified model)
    const volumeRatio = Math.min(quoteQuantity / rfqQuantity, 1);
    const discountMultiplier = 1 - (volumeRatio * 0.1); // Up to 10% discount for bulk
    
    return basePrice * discountMultiplier;
};

/**
 * Calculates delivery score with consideration for partial shipments
 */
const calculateDeliveryScore = (leadTime, minLeadTime, canPartialShip = false) => {
    const baseScore = minLeadTime / (leadTime || 1);
    
    // Boost score if supplier allows partial shipments (flexibility)
    if (canPartialShip) {
        return Math.min(baseScore * 1.1, 1.0);
    }
    
    return baseScore;
};

// ==================== MAIN RECOMMENDATION FUNCTION ====================

/**
 * Calculates quote recommendations based on multiple criteria
 * Aligned with PRD: Quote acceptance and supplier selection
 * 
 * @param {Array} quotes - Array of quote objects
 * @param {Object} options - Additional options
 * @param {Object} options.dbClient - Database client for supplier ratings
 * @param {number} options.rfqQuantity - RFQ quantity for bulk pricing
 * @param {string} options.preferredCurrency - Target currency for comparison
 * @returns {Promise<Array>} Quotes with recommendations
 */
const calculateQuoteRecommendations = async (quotes = [], options = {}) => {
    const { dbClient = null, rfqQuantity = null, preferredCurrency = 'USD' } = options;
    
    // Input validation
    if (!Array.isArray(quotes) || quotes.length === 0) {
        return [];
    }
    
    try {
        // Extract and normalize metrics
        const processedQuotes = [];
        
        for (const quote of quotes) {
            // Normalize price to preferred currency
            const normalizedPrice = normalizePrice(
                Number(quote.price || 0),
                quote.currency || 'USD',
                preferredCurrency
            );
            
            // Apply bulk discount if applicable
            const adjustedPrice = rfqQuantity 
                ? calculateBulkAdjustedPrice(quote, rfqQuantity)
                : normalizedPrice;
            
            // Get supplier rating
            const supplierRating = await calculateSupplierRating(quote.supplier_id, dbClient);
            
            // Calculate quality score
            const qualityScore = calculateQualityScore(quote);
            
            processedQuotes.push({
                ...quote,
                normalized_price: adjustedPrice,
                original_price: Number(quote.price || 0),
                quality_score: qualityScore,
                supplier_rating: supplierRating,
                lead_time: Number(quote.lead_time_days || 0)
            });
        }
        
        // Find best metrics
        const minPrice = Math.min(...processedQuotes.map(q => q.normalized_price));
        const minLeadTime = Math.min(...processedQuotes.map(q => q.lead_time));
        const maxQuality = Math.max(...processedQuotes.map(q => q.quality_score));
        const maxRating = Math.max(...processedQuotes.map(q => q.supplier_rating));
        
        // Calculate scores and recommendations
        const recommendedQuotes = processedQuotes.map((quote) => {
            const recommendationTags = [];
            
            // =====================================================
            // BEST PRICE
            // =====================================================
            if (quote.normalized_price === minPrice) {
                recommendationTags.push(RECOMMENDATION_TAGS.BEST_PRICE);
            }
            
            // =====================================================
            // FASTEST DELIVERY
            // =====================================================
            if (quote.lead_time === minLeadTime) {
                recommendationTags.push(RECOMMENDATION_TAGS.FASTEST_DELIVERY);
            }
            
            // =====================================================
            // BEST QUALITY
            // =====================================================
            if (quote.quality_score === maxQuality && maxQuality > 1.0) {
                recommendationTags.push(RECOMMENDATION_TAGS.BEST_QUALITY);
            }
            
            // =====================================================
            // HIGHEST RATED SUPPLIER
            // =====================================================
            if (quote.supplier_rating === maxRating && maxRating > 1.0) {
                recommendationTags.push(RECOMMENDATION_TAGS.HIGHEST_RATED);
            }
            
            // =====================================================
            // PPAP COMPLIANT (PRD mentions PPAP level)
            // =====================================================
            if (quote.ppap_level && quote.ppap_level !== 'Level 1') {
                recommendationTags.push(RECOMMENDATION_TAGS.PPAP_COMPLIANT);
            }
            
            // =====================================================
            // PREVIOUS PARTNER
            // =====================================================
            if (quote.previous_orders_count > 0) {
                recommendationTags.push(RECOMMENDATION_TAGS.PREVIOUS_PARTNER);
            }
            
            // =====================================================
            // CALCULATE COMPONENT SCORES
            // =====================================================
            
            // Price score (lower price = higher score)
            const priceScore = minPrice / (quote.normalized_price || 1);
            
            // Delivery score
            const deliveryScore = minLeadTime / (quote.lead_time || 1);
            
            // Quality score (normalized)
            const qualityScoreNormalized = quote.quality_score / maxQuality;
            
            // Supplier rating score
            const ratingScoreNormalized = quote.supplier_rating / maxRating;
            
            // Compliance score (based on certifications and PPAP)
            let complianceScore = 1.0;
            if (quote.certifications && quote.certifications.length > 0) complianceScore += 0.1;
            if (quote.ppap_level === 'Level 3') complianceScore += 0.15;
            if (quote.ppap_level === 'Level 2') complianceScore += 0.1;
            complianceScore = Math.min(complianceScore, 1.2);
            
            // =====================================================
            // FINAL SCORE (Weighted)
            // =====================================================
            const recommendationScore = (
                (priceScore * SCORING_WEIGHTS.PRICE) +
                (deliveryScore * SCORING_WEIGHTS.DELIVERY) +
                (qualityScoreNormalized * SCORING_WEIGHTS.QUALITY) +
                (ratingScoreNormalized * SCORING_WEIGHTS.SUPPLIER_RATING) +
                (complianceScore * SCORING_WEIGHTS.COMPLIANCE)
            );
            
            // Determine recommendation level
            let recommendation = RECOMMENDATION_LEVELS.STANDARD;
            if (recommendationScore >= 0.90) {
                recommendation = RECOMMENDATION_LEVELS.HIGHLY_RECOMMENDED;
            } else if (recommendationScore >= 0.75) {
                recommendation = RECOMMENDATION_LEVELS.RECOMMENDED;
            } else if (recommendationScore < 0.50) {
                recommendation = RECOMMENDATION_LEVELS.NOT_RECOMMENDED;
            }
            
            // =====================================================
            // RETURN ENHANCED QUOTE
            // =====================================================
            return {
                ...quote,
                recommendation,
                recommendation_tags: recommendationTags,
                recommendation_score: Number(recommendationScore.toFixed(3)),
                score_breakdown: {
                    price: Number((priceScore * SCORING_WEIGHTS.PRICE).toFixed(3)),
                    delivery: Number((deliveryScore * SCORING_WEIGHTS.DELIVERY).toFixed(3)),
                    quality: Number((qualityScoreNormalized * SCORING_WEIGHTS.QUALITY).toFixed(3)),
                    supplier_rating: Number((ratingScoreNormalized * SCORING_WEIGHTS.SUPPLIER_RATING).toFixed(3)),
                    compliance: Number((complianceScore * SCORING_WEIGHTS.COMPLIANCE).toFixed(3))
                },
                normalized_price: quote.normalized_price,
                quality_score: quote.quality_score,
                supplier_rating: quote.supplier_rating
            };
        });
        
        // Sort by recommendation score (highest first)
        return recommendedQuotes.sort((a, b) => 
            b.recommendation_score - a.recommendation_score
        );
        
    } catch (error) {
        console.error('Quote recommendation error:', error);
        
        // Fallback to simple scoring if enhanced calculation fails
        return quotes.map(quote => ({
            ...quote,
            recommendation: RECOMMENDATION_LEVELS.STANDARD,
            recommendation_tags: [],
            recommendation_score: 0.5
        }));
    }
};

// ==================== SYNC VERSION (Backward Compatible) ====================

/**
 * Synchronous version for backward compatibility
 * Note: This doesn't include supplier ratings (requires DB query)
 */
const calculateQuoteRecommendationsSync = (quotes = []) => {
    if (!Array.isArray(quotes) || quotes.length === 0) {
        return [];
    }
    
    const prices = quotes.map(quote => Number(quote.price || 0));
    const leadTimes = quotes.map(quote => Number(quote.lead_time_days || 0));
    
    const minPrice = Math.min(...prices);
    const minLeadTime = Math.min(...leadTimes);
    
    return quotes.map((quote) => {
        const currentPrice = Number(quote.price || 0);
        const currentLeadTime = Number(quote.lead_time_days || 0);
        
        const recommendationTags = [];
        
        if (currentPrice === minPrice) {
            recommendationTags.push(RECOMMENDATION_TAGS.BEST_PRICE);
        }
        
        if (currentLeadTime === minLeadTime) {
            recommendationTags.push(RECOMMENDATION_TAGS.FASTEST_DELIVERY);
        }
        
        const priceScore = minPrice / (currentPrice || 1);
        const deliveryScore = minLeadTime / (currentLeadTime || 1);
        const recommendationScore = (priceScore * 0.6) + (deliveryScore * 0.4);
        
        let recommendation = RECOMMENDATION_LEVELS.STANDARD;
        if (recommendationScore >= 0.95) {
            recommendation = RECOMMENDATION_LEVELS.HIGHLY_RECOMMENDED;
        } else if (recommendationScore >= 0.85) {
            recommendation = RECOMMENDATION_LEVELS.RECOMMENDED;
        }
        
        return {
            ...quote,
            recommendation,
            recommendation_tags: recommendationTags,
            recommendation_score: Number(recommendationScore.toFixed(2))
        };
    });
};

// ==================== EXPORTS ====================

module.exports = {
    calculateQuoteRecommendations,      // Async version (preferred)
    calculateQuoteRecommendationsSync,  // Sync version (backward compat)
    RECOMMENDATION_LEVELS,
    RECOMMENDATION_TAGS,
    SCORING_WEIGHTS
};