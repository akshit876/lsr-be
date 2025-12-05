import cv2
import numpy as np

def get_ssim(img1, img2):
    """
    Calculates SSIM (Structural Similarity Index) between two images using OpenCV.
    Matches standard SSIM implementation (e.g. skimage default).
    """
    C1 = 6.5025
    C2 = 58.5225
    
    img1 = img1.astype(np.float64)
    img2 = img2.astype(np.float64)
    
    kernel = (11, 11)
    sigma = 1.5
    
    mu1 = cv2.GaussianBlur(img1, kernel, sigma)
    mu2 = cv2.GaussianBlur(img2, kernel, sigma)
    
    mu1_sq = mu1 ** 2
    mu2_sq = mu2 ** 2
    mu1_mu2 = mu1 * mu2
    
    sigma1_sq = cv2.GaussianBlur(img1 ** 2, kernel, sigma) - mu1_sq
    sigma2_sq = cv2.GaussianBlur(img2 ** 2, kernel, sigma) - mu2_sq
    sigma12 = cv2.GaussianBlur(img1 * img2, kernel, sigma) - mu1_mu2
    
    ssim_map = ((2 * mu1_mu2 + C1) * (2 * sigma12 + C2)) / ((mu1_sq + mu2_sq + C1) * (sigma1_sq + sigma2_sq + C2))
    return ssim_map.mean(), ssim_map

def analyze_image(ref_img, test_img, mask_img, ssim_thresh=0.90, corr_thresh=0.90):
    """
    Analyzes a test image against a reference image within a masked region.
    
    Args:
        ref_img (np.array): Reference image (BGR or Gray).
        test_img (np.array): Test image (BGR or Gray).
        mask_img (np.array): Mask image (Gray, 0=Ignore, >0=ROI).
        ssim_thresh (float): Minimum SSIM score to pass.
        corr_thresh (float): Minimum Correlation score to pass.
        
    Returns:
        dict: {
            'mae': float,
            'corr': float,
            'ssim': float,
            'passed': bool,
            'heatmap': np.array (BGR visualization of diff),
            'overlay': np.array (BGR visualization of test + mask)
        }
    """
    # Ensure Gray
    if len(ref_img.shape) == 3: g_ref = cv2.cvtColor(ref_img, cv2.COLOR_BGR2GRAY)
    else: g_ref = ref_img.copy()
    
    if len(test_img.shape) == 3: g_test = cv2.cvtColor(test_img, cv2.COLOR_BGR2GRAY)
    else: g_test = test_img.copy()
    
    # Ensure sizing
    if g_test.shape != g_ref.shape:
        g_test = cv2.resize(g_test, (g_ref.shape[1], g_ref.shape[0]))
        # We also need the color version resized for overlay
        if len(test_img.shape) == 3:
             test_img_r = cv2.resize(test_img, (g_ref.shape[1], g_ref.shape[0]))
        else:
             test_img_r = g_test
    else:
        test_img_r = test_img
        
    # Masking
    mask_indices = mask_img > 0
    if not np.any(mask_indices):
        return {'mae': 0, 'corr': 0, 'ssim': 0, 'passed': False, 'msg': "Empty Mask"}
        
    pixels_ref = g_ref[mask_indices]
    pixels_test = g_test[mask_indices]
    
    # 1. MAE
    mae = np.mean(np.abs(pixels_ref.astype(int) - pixels_test.astype(int)))
    
    # 2. Correlation
    std_ref = np.std(pixels_ref)
    std_test = np.std(pixels_test)
    if std_ref < 1e-4:
        corr = 1.0 if abs(np.mean(pixels_ref) - np.mean(pixels_test)) < 10 else 0.0
    else:
        corr = np.corrcoef(pixels_ref, pixels_test)[0, 1]
        
    # 3. SSIM (Masked)
    x,y,w,h = cv2.boundingRect(mask_img)
    crop_ref = g_ref[y:y+h, x:x+w]
    crop_test = g_test[y:y+h, x:x+w]
    crop_mask = mask_img[y:y+h, x:x+w]
    
    # Custom SSIM
    score_ssim, diff_map = get_ssim(crop_ref, crop_test)
    
    if np.any(crop_mask):
         masked_ssim = np.mean(diff_map[crop_mask > 0])
    else:
         masked_ssim = 0
         
    # Verdict
    passed = (corr > corr_thresh) and (masked_ssim > ssim_thresh)
    
    # 4. Visuals - Heatmap
    diff_crop = cv2.absdiff(crop_ref, crop_test)
    diff_crop = cv2.bitwise_and(diff_crop, diff_crop, mask=crop_mask)
    heatmap_crop = cv2.applyColorMap(diff_crop, cv2.COLORMAP_JET)
    
    # We return the crop heatmap or full? 
    # Let's return the full size heatmap (black background) for easier overlay
    heatmap_full = np.zeros((ref_img.shape[0], ref_img.shape[1], 3), dtype=np.uint8)
    heatmap_full[y:y+h, x:x+w] = heatmap_crop
    # Mask out the outside again just in case
    heatmap_full[~mask_indices] = 0
    
    # 5. Visuals - Test Overlay
    if len(test_img_r.shape) == 2:
        overlay = cv2.cvtColor(test_img_r, cv2.COLOR_GRAY2BGR)
    else:
        overlay = test_img_r.copy()
        
    # Red overlay
    red_layer = np.zeros_like(overlay)
    red_layer[:, :, 2] = 255
    
    # Blend only in mask
    alpha = 0.4
    roi = overlay[mask_indices]
    red = red_layer[mask_indices]
    blended = cv2.addWeighted(roi, 1-alpha, red, alpha, 0)
    overlay[mask_indices] = blended
    
    return {
        'mae': float(mae),
        'corr': float(corr),
        'ssim': float(masked_ssim),
        'passed': bool(passed),
        'heatmap': heatmap_full,
        'overlay': overlay,
        'msg': "OK"
    }

if __name__ == "__main__":
    import sys
    # Simple CLI Test for Node.js integration
    # Usage: python core_inspector.py ref.png test.png mask.png output_heatmap.png
    if len(sys.argv) >= 4:
        ref = cv2.imread(sys.argv[1])
        test = cv2.imread(sys.argv[2])
        mask = cv2.imread(sys.argv[3], cv2.IMREAD_GRAYSCALE)
        
        if ref is None or test is None or mask is None:
            print("Error loading images")
            sys.exit(1)
            
        res = analyze_image(ref, test, mask)
        print(f"MAE: {res['mae']:.2f}, Corr: {res['corr']:.4f}, SSIM: {res['ssim']:.4f}, Pass: {res['passed']}")
        
        if len(sys.argv) >= 5:
            cv2.imwrite(sys.argv[4], res['heatmap'])
            print(f"Saved heatmap to {sys.argv[4]}")
